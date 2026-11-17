"""Save and read local album records and their cover files together."""

from datetime import datetime, timezone
import json
from pathlib import Path
import re
from tempfile import TemporaryDirectory
from threading import Lock
from unicodedata import normalize
from urllib.parse import quote, unquote, urlsplit

from album_cover_archive import ALBUMS, selected_cover_sources, write_cover_assets


RECORD_ID = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}")
INVALID_FOLDER_CHARACTERS = re.compile(r'[<>:"/\\|?*\x00-\x1f\x7f]')
WINDOWS_DEVICE_NAME = re.compile(r"(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])", re.I)
ASSET_FILES = {
    "cover": ("cover.jpg", "cover.png", "cover.webp"),
    "motionUrl": ("motion.m3u8",),
}
RECORDS_LOCK = Lock()
TEXT_LIMITS = {
    "title": 120,
    "artist": 100,
    "version": 120,
    "price": 40,
    "purchaseChannel": 200,
    "note": 1000,
    "source": 80,
}


def web_url(value):
    if value == "":
        return value
    if not isinstance(value, str):
        raise ValueError("图片或来源地址格式无效")
    url = urlsplit(value)
    if url.scheme not in ("https", "http") or not url.hostname or url.username or url.password:
        raise ValueError("图片或来源地址格式无效")
    return value


def read_record(folder):
    record = json.loads((folder / "album.json").read_text(encoding="utf-8"))
    record_id = record.get("id") if isinstance(record, dict) else None
    if not isinstance(record_id, str) or not record_id.startswith("record-") or not RECORD_ID.fullmatch(record_id[7:]):
        raise ValueError("唱片记录格式无效")
    if record.get("format") not in ("vinyl", "cd") or not record.get("title"):
        raise ValueError("唱片记录缺少专辑名称或介质")
    if any(not isinstance(record.get(field), str) for field in (
        *TEXT_LIMITS, "createdAt", "cover", "motionUrl", "storeUrl",
    )):
        raise ValueError("唱片记录字段格式无效")
    return record


def stored_albums():
    for metadata in ALBUMS.glob("*/album.json"):
        folder = metadata.parent
        if folder.is_symlink() or metadata.is_symlink():
            continue
        try:
            record = read_record(folder)
        except (OSError, ValueError):
            continue
        yield folder, record


def local_asset_name(folder, record, field):
    directory, _, filename = unquote(record[field]).rpartition("/")
    if filename in ASSET_FILES[field] and directory in (
        "", f"/public/albums/{folder.name}", f"/public/albums/{record['id']}",
    ):
        return filename
    return ""


def browser_record(folder, record):
    result = dict(record)
    prefix = f"/public/albums/{quote(folder.name, safe='')}/"
    for field in ASSET_FILES:
        filename = local_asset_name(folder, record, field)
        if filename:
            result[field] = prefix + filename
    return result


def list_album_records():
    records = [browser_record(folder, record) for folder, record in stored_albums()]
    return sorted(records, key=lambda record: (record["createdAt"], record["id"]))


def find_record(record_id):
    for folder, record in stored_albums():
        if record["id"] == record_id:
            return browser_record(folder, record)
    return None


def available_album_folder(title):
    name = INVALID_FOLDER_CHARACTERS.sub("_", normalize("NFC", title)).strip(" .")
    name = name.encode("utf-8")[:220].decode("utf-8", errors="ignore").rstrip(" .") or "未命名专辑"
    if WINDOWS_DEVICE_NAME.fullmatch(name.split(".", 1)[0]):
        name = "_" + name
    used = {normalize("NFC", entry.name).casefold() for entry in ALBUMS.iterdir()}
    candidate = name
    suffix = 2
    while candidate.casefold() in used:
        candidate = f"{name} ({suffix})"
        suffix += 1
    return ALBUMS / candidate


def write_record(path, record):
    path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def migrate_album_folders():
    renamed = []
    with RECORDS_LOCK:
        for folder, record in sorted(stored_albums(), key=lambda album: album[1]["createdAt"]):
            if folder.name != record["id"]:
                continue
            target = available_album_folder(record["title"])
            for field in ASSET_FILES:
                filename = local_asset_name(folder, record, field)
                if filename:
                    record[field] = filename
            with TemporaryDirectory(dir=ALBUMS, prefix=".album-migration-") as temporary:
                staged = Path(temporary) / "album.json"
                write_record(staged, record)
                folder.rename(target)
                try:
                    staged.replace(target / "album.json")
                except OSError:
                    target.rename(folder)
                    raise
            renamed.append(target.name)
    return renamed


def save_album_record(data):
    record_id = data.get("id")
    if not isinstance(record_id, str) or not RECORD_ID.fullmatch(record_id):
        raise ValueError("唱片记录编号无效")
    record_id = f"record-{record_id}"
    saved = find_record(record_id)
    if saved:
        return saved

    record = {"id": record_id}
    for field, limit in TEXT_LIMITS.items():
        value = data.get(field, "")
        if not isinstance(value, str) or len(value) > limit:
            raise ValueError("唱片信息过长或格式无效")
        record[field] = value.strip()
    record["format"] = data.get("format")
    if not record["title"] or record["format"] not in ("vinyl", "cd"):
        raise ValueError("请填写专辑名称并选择介质")

    record["cover"] = web_url(data.get("cover", ""))
    record["motionUrl"] = ""
    record["storeUrl"] = web_url(data.get("storeUrl", ""))
    selection = data.get("selectedCover")
    if selection is not None and not isinstance(selection, dict):
        raise ValueError("选中的封面格式无效")
    sources = selected_cover_sources(selection) if selection is not None else None
    if sources:
        record["collectionId"] = selection["collectionId"]
    record["createdAt"] = datetime.now(timezone.utc).isoformat(timespec="milliseconds")

    ALBUMS.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=ALBUMS, prefix=".record-") as temporary:
        staged = Path(temporary) / record_id
        staged.mkdir()
        if sources:
            record["cover"], record["motionUrl"] = write_cover_assets(staged, sources)
        write_record(staged / "album.json", record)
        with RECORDS_LOCK:
            saved = find_record(record_id)
            if saved:
                return saved
            target = available_album_folder(record["title"])
            staged.rename(target)
    return browser_record(target, record)
