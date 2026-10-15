"""Regression checks for grouped originals and unchanged static-photo handling."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('sync_concerts', Path(__file__).with_name('sync-concerts.py'))
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class MediaScanTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.folder = self.root / 'public/concert/2025-07-13'
        self.folder.mkdir(parents=True)
        self.root_patch = patch.object(sync, 'ROOT', self.root)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)

    def file(self, relative):
        target = self.folder / 'live' / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b'original')
        return target

    def test_nested_pair_uses_originals_without_converting(self):
        image = self.file('IMG_0136/IMG_0136.HEIC')
        video = self.file('IMG_0136/IMG_0136.MOV')
        with patch.object(sync, 'photo_path', side_effect=AssertionError('live originals must not be converted')):
            media = sync.scan_media(self.folder, 'poster.jpg')
        self.assertEqual(len(media), 1)
        self.assertEqual(media[0]['kind'], 'live')
        self.assertEqual(media[0]['image'], sync.url(image))
        self.assertEqual(media[0]['video'], sync.url(video))
        self.assertFalse((image.parent / '_web').exists())

    def test_flat_pair_is_supported_with_case_insensitive_names(self):
        self.file('IMG_9573.HEIC')
        video = self.file('img_9573.mov')
        with patch.object(sync, 'photo_path') as convert:
            media = sync.scan_media(self.folder, 'poster.jpg')
            convert.assert_not_called()
        self.assertEqual(media[0]['video'], sync.url(video))
        self.assertEqual(media[0]['kind'], 'live')

    def test_identical_names_in_separate_groups_are_not_collapsed(self):
        for group in ['a', 'b']:
            self.file(f'{group}/IMG_0001.HEIC')
            self.file(f'{group}/IMG_0001.MOV')
        with patch.object(sync, 'photo_path') as convert:
            media = sync.scan_media(self.folder, 'poster.jpg')
            convert.assert_not_called()
        self.assertEqual(len(media), 2)
        self.assertEqual(len({item['video'] for item in media}), 2)

    def test_pairing_does_not_cross_folders(self):
        image = self.file('a/IMG_0001.HEIC')
        video = self.file('b/IMG_0001.MOV')
        with patch.object(sync, 'photo_path', return_value=image):
            media = sync.scan_media(self.folder, 'poster.jpg')
        self.assertEqual([m['kind'] for m in media], ['photo', 'video'])
        self.assertEqual(media[1]['video'], sync.url(video))

    def test_static_photo_still_uses_existing_converter(self):
        image = self.file('IMG_STATIC.HEIC')
        converted = image.parent / '_web/IMG_STATIC.jpg'
        with patch.object(sync, 'photo_path', return_value=converted) as convert:
            media = sync.scan_media(self.folder, 'poster.jpg')
            convert.assert_called_once_with(image)
        self.assertEqual(media[0]['kind'], 'photo')
        self.assertEqual(media[0]['image'], sync.url(converted))

    def test_generated_hidden_and_unsupported_files_are_ignored(self):
        image = self.file('still.JPG')
        for name in ['_web/old.jpg', '_web/old.mp4', 'group/_web/old.jpg', '.hidden/IMG.HEIC', '.DS_Store', 'notes.txt']:
            self.file(name)
        media = sync.scan_media(self.folder, 'poster.jpg')
        self.assertEqual(len(media), 1)
        self.assertEqual(media[0]['image'], sync.url(image))

    def test_missing_album_is_empty(self):
        self.assertEqual(sync.scan_media(self.folder, 'poster.jpg'), [])


if __name__ == '__main__':
    unittest.main()
