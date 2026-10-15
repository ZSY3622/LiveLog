"""Regression checks for the generated video cache; no media dependencies needed."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('sync_concerts', Path(__file__).with_name('sync-concerts.py'))
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class VideoCacheTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.source = Path(self.folder.name) / 'IMG_TEST.MOV'
        self.source.write_bytes(b'original')
        self.target = self.source.parent / '_web' / 'IMG_TEST.mp4'
        self.target.parent.mkdir()

    def test_empty_cache_is_rebuilt(self):
        self.target.touch()
        self.assertFalse(sync.fresh(self.source, self.target))
        def convert(command, **kwargs):
            self.assertNotEqual(Path(command[-1]), self.target)
            Path(command[-1]).write_bytes(b'converted')
        with patch.object(sync.shutil, 'which', return_value='/mock/ffmpeg'), patch.object(sync.subprocess, 'run', side_effect=convert):
            self.assertEqual(sync.video_path(self.source), self.target)
        self.assertEqual(self.target.read_bytes(), b'converted')
        self.assertEqual(list(self.target.parent.iterdir()), [self.target])

    def test_failure_preserves_previous_video_and_cleans_partial(self):
        self.target.write_bytes(b'previous-valid-video')
        os.utime(self.target, (0, 0))
        def fail(command, **kwargs):
            Path(command[-1]).write_bytes(b'partial')
            raise subprocess.CalledProcessError(1, command)
        with patch.object(sync.shutil, 'which', return_value='/mock/ffmpeg'), patch.object(sync.subprocess, 'run', side_effect=fail):
            with self.assertRaises(subprocess.CalledProcessError):
                sync.video_path(self.source)
        self.assertEqual(self.target.read_bytes(), b'previous-valid-video')
        self.assertEqual(list(self.target.parent.iterdir()), [self.target])

    def test_fresh_valid_cache_skips_conversion(self):
        self.target.write_bytes(b'cached')
        with patch.object(sync.subprocess, 'run') as convert:
            self.assertEqual(sync.video_path(self.source), self.target)
            convert.assert_not_called()

    def test_empty_success_output_is_rejected(self):
        with patch.object(sync.shutil, 'which', return_value='/mock/ffmpeg'), patch.object(sync.subprocess, 'run'):
            with self.assertRaises(RuntimeError):
                sync.video_path(self.source)
        self.assertFalse(self.target.exists())
        self.assertEqual(list(self.target.parent.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
