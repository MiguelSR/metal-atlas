"""Reading and writing JSON files."""

import json
import os
from pathlib import Path
from typing import Any


def read_json(path: str | Path, default: Any = None) -> Any:
    """The parsed file, or ``default`` if it does not exist."""
    path = Path(path)
    if not path.exists():
        return default
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def write_json(
    path: str | Path,
    data: Any,
    *,
    compact: bool = False,
    indent: int | None = None,
    ensure_ascii: bool = False,
) -> None:
    """Writes ``data`` atomically (a temporary file renamed over the target), so readers never see half a file.

    compact: no spaces after separators (files served to the browser).
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    separators = (",", ":") if compact else None
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=ensure_ascii, separators=separators, indent=indent)
    os.replace(tmp, path)


def read_cached(folder: Path, band_id: int) -> Any:
    """A per-band cache file (``<folder>/<id>.json``), or None."""
    return read_json(folder / f"{band_id}.json")


def write_cached(folder: Path, band_id: int, data: Any) -> None:
    write_json(folder / f"{band_id}.json", data)
