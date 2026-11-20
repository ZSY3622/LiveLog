"""Serve LiveLog locally with live Apple Music motion artwork lookup."""

import argparse
from concurrent.futures import ThreadPoolExecutor, wait
from functools import lru_cache
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from album_cover_archive import archive_album_cover
from album_motion import NoMotionArtwork, album_page_url, resolve_album
from album_records import list_album_records, save_album_record


ROOT = Path(__file__).resolve().parents[1]
MOTION_PATH = "/api/album-motion"
SAVE_COVER_PATH = "/api/album-cover"
ALBUMS_PATH = "/api/albums"
MAX_ALBUMS = 12


@lru_cache(maxsize=256)
def look_up_motion(url):
    try:
        return resolve_album(url)
    except NoMotionArtwork:
        return None


class PreviewHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".m3u8": "application/vnd.apple.mpegurl",
        ".m4s": "video/iso.segment",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def loopback_host(self):
        port = self.server.server_port
        return self.headers.get("Host") in (f"127.0.0.1:{port}", f"localhost:{port}")

    def motion_origin_allowed(self):
        return self.loopback_host() and self.headers.get("Origin") in (
            None, "null", f'http://{self.headers.get("Host")}'
        )

    def do_HEAD(self):
        if not self.loopback_host():
            self.send_error(403)
            return
        super().do_HEAD()

    def do_OPTIONS(self):
        if urlsplit(self.path).path != MOTION_PATH or not self.motion_origin_allowed():
            self.send_error(403)
            return
        self.send_response(204)
        self.motion_headers()
        self.end_headers()

    def do_POST(self):
        path = urlsplit(self.path).path
        if path not in (ALBUMS_PATH, SAVE_COVER_PATH):
            self.send_error(404)
            return
        origin = f'http://{self.headers.get("Host")}'
        if not self.loopback_host() or self.headers.get("Origin") != origin:
            self.send_error(403)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 32 * 1024 or self.headers.get_content_type() != "application/json":
                raise ValueError
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError
        except ValueError:
            self.send_json({"error": "唱片保存请求无效"}, status=400)
            return

        try:
            saved = save_album_record(data) if path == ALBUMS_PATH else archive_album_cover(data)
        except ValueError as error:
            self.send_json({"error": str(error)}, status=422)
        except OSError:
            self.send_json({"error": "无法写入本地唱片目录"}, status=500)
        else:
            self.send_json(saved)

    def do_GET(self):
        if not self.loopback_host():
            self.send_error(403)
            return
        request = urlsplit(self.path)
        if request.path == ALBUMS_PATH:
            origin = self.headers.get("Origin")
            if origin is not None and origin != f'http://{self.headers.get("Host")}':
                self.send_error(403)
            else:
                self.send_json(list_album_records())
            return
        if request.path != MOTION_PATH:
            super().do_GET()
            return
        if not self.motion_origin_allowed():
            self.send_error(403)
            return

        try:
            parameters = parse_qs(request.query, max_num_fields=MAX_ALBUMS)
        except ValueError:
            self.send_error(400)
            return
        pages = {}
        for url in parameters.get("url", []):
            if len(url) > 1024:
                continue
            try:
                page, album_id = album_page_url(url)
            except ValueError:
                continue
            pages.setdefault(album_id, page)

        futures = [self.server.motion_workers.submit(look_up_motion, page) for page in pages.values()]
        finished, pending = wait(futures, timeout=10)
        for future in pending:
            future.cancel()
        albums = []
        for future in finished:
            try:
                result = future.result()
            except ValueError:
                continue
            if result:
                albums.append(result)
        self.send_json(albums)

    def motion_headers(self):
        if self.headers.get("Origin") == "null":
            self.send_header("Access-Control-Allow-Origin", "null")
            self.send_header("Access-Control-Allow-Methods", "GET")
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Vary", "Origin")

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        try:
            self.send_response(status)
            self.motion_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    with ThreadPoolExecutor(max_workers=8) as workers, ThreadingHTTPServer(
        ("127.0.0.1", args.port), PreviewHandler
    ) as server:
        server.motion_workers = workers
        print(f"http://127.0.0.1:{server.server_port}/albums.html", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
