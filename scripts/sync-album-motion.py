"""Read verified motion artwork from public Apple Music album pages."""

import argparse
import json
from pathlib import Path
import tempfile

from album_motion import resolve_album


DATA_FILE = Path(__file__).resolve().parents[1] / "public" / "album-motion-data.js"
DATA_PREFIX = "window.ALBUM_MOTION_DATA = "


def update_catalog(albums):
    entries = []
    if DATA_FILE.exists():
        document = DATA_FILE.read_text(encoding="utf-8").strip()
        if not document.startswith(DATA_PREFIX) or not document.endswith(";"):
            raise ValueError(f"动态封面清单格式异常：{DATA_FILE}")
        entries = json.loads(document[len(DATA_PREFIX):-1])
    by_id = {entry["collectionId"]: entry for entry in entries}
    by_id.update((album["collectionId"], album) for album in albums)
    body = json.dumps(list(by_id.values()), ensure_ascii=False, indent=2)

    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=DATA_FILE.parent, delete=False) as output:
        temporary_path = Path(output.name)
        output.write(f"{DATA_PREFIX}{body};\n")
    try:
        temporary_path.chmod(0o644)
        temporary_path.replace(DATA_FILE)
    finally:
        temporary_path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("album_url", nargs="+", help="Apple Music album page URL")
    args = parser.parse_args()
    try:
        albums = [resolve_album(url, timeout=15) for url in args.album_url]
        update_catalog(albums)
    except (OSError, KeyError, TypeError, ValueError) as error:
        parser.exit(1, f"{error}\n")
    for album in albums:
        print(f'{album["artist"]} · {album["title"]} ({album["collectionId"]})')


if __name__ == "__main__":
    main()
