"""Merges the advanced-search pages downloaded by `scrape` into the master dataset (one record per band).

Usage: python3 -m metal_atlas merge [output.json]      (default: the master dataset path, see paths.DATASET)
"""

import json
import re
import sys
from collections.abc import Iterator

from . import metal_archives as ma
from . import paths
from .jsonio import read_json, write_json
from .text import strip_html

FIELDS = [
    "id",
    "name",
    "aka",
    "aka_list",
    "url",
    "genre",
    "country",
    "location",
    "status",
    "formed_in",
    "themes",
    "label",
    "notes",
    "notes_truncated",
    "contact_emails",
]

# the columns after the name column, per scrape job
LAYOUT = {
    **{f"status{s}": ["genre", "country", "label"] for s in range(1, len(ma.STATUSES) + 1)},
    "location": ["genre", "country", "location"],
    "themes": ["genre", "country", "themes"],
    "notes": ["genre", "country", "notes_html"],
    "year": ["genre", "country", "year"],
}
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")


def contact_emails(notes: str | None) -> list[str] | None:
    emails = sorted(set(_EMAIL.findall(notes or "")))
    return emails or None


def job_rows(job: str) -> Iterator[list[str]]:
    folder = paths.SEARCH_PAGES_DIR / job
    for page in sorted(folder.glob("*.json"), key=lambda p: int(p.stem)):
        yield from read_json(page)["aaData"]


def apply_columns(band: dict, job: str, values: dict[str, str]) -> None:
    """Fills a band record from one row of a job."""
    for key in ("genre", "country"):
        if values.get(key) and key not in band:
            band[key] = strip_html(values[key])
    if "year" in values and "formed_in" not in band:
        band["formed_in"] = int(values["year"]) if values["year"].isdigit() else None
    if job.startswith("status"):
        band["status"] = ma.STATUSES[int(job.removeprefix("status")) - 1]
        band["label"] = strip_html(values["label"]) or None
    elif job in ("location", "themes"):
        band[job] = strip_html(values[job]) or None
    elif job == "notes":
        raw = values["notes_html"]
        band["notes"] = strip_html(raw)
        band["notes_truncated"] = raw.rstrip().endswith("...")
        band["contact_emails"] = contact_emails(band["notes"])


def merge() -> list[dict]:
    bands: dict[int, dict] = {}
    for job, columns in LAYOUT.items():
        if not (paths.SEARCH_PAGES_DIR / job).is_dir():
            print("missing job", job)
            continue
        rows = 0
        for row in job_rows(job):
            cell = ma.parse_search_name(row[0])
            if not cell:
                print("unparsed", job, row[0][:200])
                continue
            band = bands.get(cell.band_id)
            if band is None:
                band = bands[cell.band_id] = {"id": cell.band_id, "name": cell.name, "url": cell.url}
                if cell.aka:
                    band["aka"], band["aka_list"] = cell.aka, cell.aka_list
            apply_columns(band, job, dict(zip(columns, (c.strip() for c in row[1:]))))
            rows += 1
        print(f"{job}: {rows} rows, {len(bands)} unique bands so far", flush=True)
    return [{key: bands[i].get(key) for key in FIELDS} for i in sorted(bands)]


def main(argv: list[str] | None = None) -> None:
    argv = sys.argv[1:] if argv is None else argv
    out = merge()
    coverage = {key: sum(1 for b in out if b[key] not in (None, [], "")) for key in FIELDS}
    print("bands:", len(out))
    print("coverage:", json.dumps(coverage, indent=1))
    write_json(argv[0] if argv else paths.DATASET, out, indent=1)
