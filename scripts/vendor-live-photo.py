#!/usr/bin/env python3
"""Vendor a pinned official npm release and expose its existing Player class."""
import hashlib
from pathlib import Path
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = '1.2.0'
SHA1 = '856e7c7c5c08781800970ff9eb512aff27fa2efc'
TARGET = ROOT / 'public' / 'vendor' / 'live-photo' / VERSION


def vendor(archive):
    if hashlib.sha1(archive.read_bytes()).hexdigest() != SHA1:
        raise SystemExit('发布包校验失败，请使用 @thun888/live-photo@1.2.0 的官方 npm 发布包。')
    TARGET.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive) as package:
        for name in ['LICENSE', 'package.json', 'dist/bundle.js', 'dist/931.bundle.js', 'dist/main.css']:
            data = package.extractfile('package/' + name).read()
            if name == 'dist/bundle.js':
                # No renderer/decoder fork: export the class already used by upstream init().
                old = b'r.d(a,{init:()=>p})'
                new = b'r.d(a,{init:()=>p,Player:()=>g})'
                if data.count(old) != 1:
                    raise SystemExit('上游导出结构改变，需重新检查适配器。')
                data = data.replace(old, new)
            destination = TARGET / Path(name).name
            destination.write_bytes(data)
    print('已保存 thun888/LivePhoto ' + VERSION + ' 与 HEIC 解码分块。')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('用法：python3 scripts/vendor-live-photo.py /path/to/thun888-live-photo-1.2.0.tgz')
    vendor(Path(sys.argv[1]))
