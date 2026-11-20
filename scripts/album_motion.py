"""Read square motion artwork for an exact Apple Music album ID."""

import json
import re
import subprocess
from urllib.parse import urlsplit


PAGE_DATA = re.compile(r'<script\b[^>]*\bid="serialized-server-data"[^>]*>(.*?)</script>', re.S)
ALBUM_PATH = re.compile(r"/([a-z]{2})/album/[^/]+/([0-9]{1,20})/?")


class NoMotionArtwork(ValueError):
    """The corresponding album page had no square motion artwork."""


def album_page_url(value):
    url = urlsplit(value)
    match = ALBUM_PATH.fullmatch(url.path)
    if url.scheme != "https" or url.netloc != "music.apple.com" or not match:
        raise ValueError("请提供包含地区、专辑名称和 ID 的 Apple Music 专辑链接")
    return url._replace(query="", fragment="").geturl(), int(match[2])


def is_media_url(value, domain):
    if not isinstance(value, str):
        return False
    url = urlsplit(value)
    host = url.hostname or ""
    return url.scheme == "https" and not url.username and not url.password and (
        host == domain or host.endswith("." + domain)
    )


def read_album(page_url, *, timeout=15):
    page_url, album_id = album_page_url(page_url)
    response = subprocess.run(
        ["curl", "-fsS", "--globoff", "--max-time", str(timeout), "--", page_url],
        capture_output=True, encoding="utf-8",
    )
    if response.returncode:
        raise ValueError(f"读取专辑页失败：{page_url}\n{response.stderr.strip()}")
    data = PAGE_DATA.search(response.stdout)
    if not data:
        raise ValueError(f"网页缺少专辑数据：{page_url}")

    payload = json.loads(data[1])
    header = next((
        item
        for entry in payload["data"]
        for section in (entry.get("data") or {}).get("sections", [])
        for item in section.get("items", [])
        if item.get("id") == f"album-detail-header - {album_id}"
    ), None)
    if header is None:
        raise ValueError(f"网页未返回对应专辑 {album_id}：{page_url}")

    artwork = header.get("videoArtwork") or {}
    square = (artwork.get("dictionary") or {}).get("motionDetailSquare") or {}
    motion_url = square.get("video")
    if not is_media_url(motion_url, "itunes.apple.com") or not urlsplit(motion_url).path.endswith(".m3u8"):
        raise NoMotionArtwork(f"未找到方形动态封面：{page_url}")

    cover = (square.get("previewFrame") or {}).get("url", "")
    artist = next((link["title"] for link in header.get("subtitleLinks", []) if link.get("title")), "")
    return {
        "collectionId": album_id,
        "title": header["title"],
        "artist": artist,
        "cover": cover.replace("{w}", "600").replace("{h}", "600").replace("{f}", "jpg")
        if is_media_url(cover, "mzstatic.com") else "",
        "motionUrl": motion_url,
        "storeUrl": page_url,
        "source": "Apple Music",
    }


def resolve_album(page_url, *, timeout=4):
    page_url, album_id = album_page_url(page_url)
    url = urlsplit(page_url)
    _, storefront, _, slug, *_ = url.path.split("/")
    error = None
    for region in dict.fromkeys((storefront, "cn", "us")):
        regional_url = f"https://music.apple.com/{region}/album/{slug}/{album_id}"
        try:
            return read_album(regional_url, timeout=timeout)
        except NoMotionArtwork:
            raise
        except (OSError, KeyError, TypeError, ValueError) as failure:
            error = failure
    raise ValueError(f"未能读取专辑 {album_id} 的 Apple Music 页面") from error
