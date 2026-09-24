"""Raw API pages cached on disk. A finished day never changes, so it's fetched once and
long pulls can resume after an interruption.
"""

import gzip
import json
from collections.abc import Iterator
from datetime import date
from pathlib import Path
from typing import Any


class RawPageCache:
    """Stores raw pages as gzipped JSON at <root>/<kind>/<YYYY-MM-DD>/page-NNNN.json.gz.
    A 50-record KHMDHS page is about 200 KB of JSON and compresses roughly tenfold."""

    def __init__(self, root: Path) -> None:
        self._root = root

    def _path(self, kind: str, day: date, page: int) -> Path:
        return self._root / kind / day.isoformat() / f"page-{page:04d}.json.gz"

    def get(self, kind: str, day: date, page: int) -> Any | None:
        path = self._path(kind, day, page)
        if not path.exists():
            return None
        return json.loads(gzip.decompress(path.read_bytes()).decode("utf-8"))

    def put(self, kind: str, day: date, page: int, payload: Any) -> None:
        path = self._path(kind, day, page)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + ".tmp")
        tmp.write_bytes(gzip.compress(json.dumps(payload, ensure_ascii=False).encode("utf-8")))
        tmp.replace(path)

    def iter_pages(self, kind: str) -> Iterator[tuple[date, Any]]:
        """Every cached page of one kind, oldest day first."""
        kind_dir = self._root / kind
        if not kind_dir.exists():
            return
        for day_dir in sorted(p for p in kind_dir.iterdir() if p.is_dir()):
            day = date.fromisoformat(day_dir.name)
            for path in sorted(day_dir.glob("page-*.json.gz")):
                yield day, json.loads(gzip.decompress(path.read_bytes()).decode("utf-8"))
