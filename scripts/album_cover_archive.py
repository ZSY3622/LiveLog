"""Store a selected Apple cover and its playable media in public/albums."""

import errno
from hashlib import sha256
import logging
from pathlib import Path
import re
import subprocess
from tempfile import TemporaryDirectory
from time import sleep
from urllib.parse import urljoin, urlsplit

from album_motion import is_media_url


ROOT = Path(__file__).resolve().parents[1]
ALBUMS = ROOT / "public" / "albums"
PLAYLIST_LIMIT = 512 * 1024
MEDIA_LIMIT = 64 * 1024 * 1024
LOGGER = logging.getLogger(__name__)


def download(url, domain, limit):
    if limit <= 0:
        raise ValueError("动态封面文件过大")
    if not is_media_url(url, domain) or urlsplit(url).port not in (None, 443):
        raise ValueError("封面文件地址不在 Apple 媒体服务上")
    command = [
        "curl", "-fsS", "--globoff", "--max-time", "12",
        "--max-filesize", str(limit), "--", url,
    ]
    # Use a fresh stdout buffer so partial bytes from a failed attempt never get saved.
    for attempt in range(2):
        if attempt:
            sleep(1)
        result = subprocess.run(command, capture_output=True)
        if result.returncode == 0 and 0 < len(result.stdout) <= limit:
            return result.stdout
    LOGGER.warning(
        "Apple media download failed for %s (%s): %s",
        Path(urlsplit(url).path).name, result.returncode,
        result.stderr.decode("utf-8", errors="replace").strip(),
    )
    raise ValueError("Apple 封面文件下载失败")


def write_poster(folder, url, fallback):
    for candidate in dict.fromkeys((url, fallback)):
        if not candidate:
            continue
        try:
            image = download(candidate, "mzstatic.com", 8 * 1024 * 1024)
        except ValueError:
            continue
        if image.startswith(b"\xff\xd8\xff"):
            extension = "jpg"
        elif image.startswith(b"\x89PNG\r\n\x1a\n"):
            extension = "png"
        elif image.startswith(b"RIFF") and image[8:12] == b"WEBP":
            extension = "webp"
        else:
            continue
        filename = f"cover.{extension}"
        (folder / filename).write_bytes(image)
        return filename
    raise ValueError("无法下载封面图片")


def read_playlist(url):
    data = download(url, "itunes.apple.com", PLAYLIST_LIMIT).decode("utf-8-sig")
    lines = [line.strip() for line in data.splitlines() if line.strip()]
    if not lines or lines[0] != "#EXTM3U":
        raise ValueError("Apple 返回了无效的动态封面清单")
    return lines


def media_playlist(url):
    lines = read_playlist(url)
    variants = []
    for tag, uri in zip(lines, lines[1:]):
        if not tag.startswith("#EXT-X-STREAM-INF:") or uri.startswith("#"):
            continue
        resolution = re.search(r"\bRESOLUTION=(\d+)x(\d+)", tag)
        if resolution:
            size = max(int(resolution[1]), int(resolution[2]))
            variants.append(("avc1." in tag, size, uri))
    if variants:
        # Keep a compatible, sharp rendition without archiving an entire adaptive stream.
        _, _, uri = max(variants, key=lambda item: (item[0], item[1] <= 1080, -abs(1080 - item[1])))
        url = urljoin(url, uri)
        lines = read_playlist(url)
    if "#EXT-X-ENDLIST" not in lines:
        raise ValueError("动态封面不是完整的点播视频")
    return url, lines


def byte_range(value, offset):
    parsed = re.fullmatch(r"(\d+)(?:@(\d+))?", value)
    if not parsed or int(parsed[1]) == 0 or (parsed[2] is None and offset is None):
        raise ValueError("动态封面清单包含无效的字节范围")
    start = int(parsed[2]) if parsed[2] is not None else offset
    return start, start + int(parsed[1])


def write_motion(folder, source):
    playlist_url, lines = media_playlist(source)
    downloads = {}
    remaining = MEDIA_LIMIT
    output = []
    segment_count = 0
    pending_range = None
    previous_media = None
    next_offset = None

    def save_part(uri, name, span):
        nonlocal remaining
        url = urljoin(playlist_url, uri)
        if url not in downloads:
            downloads[url] = download(url, "itunes.apple.com", remaining)
            remaining -= len(downloads[url])
        part = downloads[url]
        if span:
            start, end = span
            if end > len(part):
                raise ValueError("下载的视频数据不完整")
            part = part[start:end]
        (folder / name).write_bytes(part)

    for line in lines:
        if line.startswith("#EXT-X-KEY:") and line != "#EXT-X-KEY:METHOD=NONE":
            raise ValueError("无法保存加密的动态封面")
        if line.startswith("#EXT-X-MAP:"):
            uri = re.search(r'\bURI="([^"]+)"', line)
            span = re.search(r'\bBYTERANGE="([^"]+)"', line)
            if not uri:
                raise ValueError("动态封面清单缺少初始化文件")
            name = f"init-{len(output)}.mp4"
            save_part(uri[1], name, byte_range(span[1], 0) if span else None)
            output.append(f'#EXT-X-MAP:URI="{name}"')
        elif line.startswith("#EXT-X-BYTERANGE:"):
            pending_range = line.split(":", 1)[1]
        elif line.startswith("#"):
            if re.search(r"\bURI=", line):
                raise ValueError("动态封面清单包含无法保存的外部引用")
            output.append(line)
        else:
            media = urljoin(playlist_url, line)
            span = byte_range(pending_range, next_offset if media == previous_media else None) if pending_range else None
            segment_count += 1
            extension = "ts" if urlsplit(media).path.lower().endswith(".ts") else "m4s"
            name = f"segment-{segment_count:02d}.{extension}"
            save_part(line, name, span)
            output.append(name)
            previous_media, next_offset = media, span[1] if span else None
            pending_range = None
    if not segment_count or pending_range:
        raise ValueError("动态封面没有完整的视频分片")
    (folder / "motion.m3u8").write_text("\n".join(output) + "\n", encoding="utf-8")


def archive_paths(folder, with_motion):
    cover = next(iter(folder.glob("cover.*")), None)
    motion = folder / "motion.m3u8"
    if cover is None or (with_motion and not motion.is_file()):
        return None
    return {
        "cover": "/" + cover.relative_to(ROOT).as_posix(),
        "motionUrl": "/" + motion.relative_to(ROOT).as_posix() if with_motion else "",
    }


def selected_cover_sources(data):
    album_id = data.get("collectionId")
    cover = data.get("cover")
    fallback = data.get("originalArtworkUrl") or ""
    motion = data.get("motionUrl") or ""
    if type(album_id) is not int or not 0 < album_id < 10**20:
        raise ValueError("封面缺少有效的 Apple 专辑 ID")
    if not all(isinstance(value, str) for value in (cover, fallback, motion)):
        raise ValueError("封面地址格式无效")
    if not is_media_url(cover, "mzstatic.com") or (motion and not is_media_url(motion, "itunes.apple.com")):
        raise ValueError("请选择 Apple 搜索结果中的封面")
    return cover, fallback, motion


def write_cover_assets(folder, sources):
    cover, fallback, motion = sources
    filename = write_poster(folder, cover, fallback)
    if motion:
        write_motion(folder, motion)
    return filename, "motion.m3u8" if motion else ""


def archive_album_cover(data):
    sources = selected_cover_sources(data)
    album_id = data["collectionId"]
    cover, fallback, motion = sources
    fingerprint = sha256("\0".join((cover, fallback, motion)).encode()).hexdigest()[:12]
    target = ALBUMS / f"{album_id}-{fingerprint}"
    saved = archive_paths(target, bool(motion))
    if saved:
        return saved
    ALBUMS.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=ALBUMS, prefix=".cover-") as temporary:
        staged = Path(temporary) / "album"
        staged.mkdir()
        write_cover_assets(staged, sources)
        try:
            staged.rename(target)
        except OSError as error:
            if error.errno not in (errno.EEXIST, errno.ENOTEMPTY) or not archive_paths(target, bool(motion)):
                raise
    return archive_paths(target, bool(motion))
