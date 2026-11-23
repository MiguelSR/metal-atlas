"""Downloads the whole Metal Archives advanced band search (the initial scrape; `update` keeps it current).

The search only returns a few columns per query, so it runs as 10 "jobs" that together cover every field:
status1…status6 (genre, country, label, by status), location, themes, notes, year.
Blank formation-year fields widen the results from ~164k to every band (but hide the year column), which is why
the year has a job of its own. Pages are saved to scraper/pages/<job>/<offset>.json; existing ones are skipped.

Usage: python3 -m metal_atlas scrape [job …]     (DELAY: seconds between requests, default 0.8)
"""

import os
import sys

from . import metal_archives as ma
from . import paths
from .jsonio import read_json, write_json
from .net import fetch_json

PAGE = 200
ALL_YEARS = {"yearCreationFrom": "", "yearCreationTo": ""}
JOBS = {
    **{f"status{s}": {**ALL_YEARS, "status": s, "bandLabelName": "*"} for s in range(1, len(ma.STATUSES) + 1)},
    "location": {**ALL_YEARS, "location": "*"},
    "themes": {**ALL_YEARS, "themes": "*"},
    "notes": {**ALL_YEARS, "bandNotes": "*"},
    "year": {"yearCreationFrom": "*", "yearCreationTo": "*"},
}


def run_job(job: str, delay: float) -> None:
    folder = paths.SEARCH_PAGES_DIR / job

    def page(start: int) -> dict:
        path = folder / f"{start}.json"
        data = read_json(path)
        if data is None:
            data = fetch_json(ma.advanced_search_url(JOBS[job], start, PAGE), delay=delay)
            write_json(path, data, ensure_ascii=True)
        return data

    total = page(0)["iTotalRecords"]
    print(f"{job}: {total} records", flush=True)
    for start in range(PAGE, total, PAGE):
        page(start)
        if (start // PAGE) % 50 == 0:
            print(f"  {job} {start}/{total}", flush=True)
    print(f"{job}: done", flush=True)


def main(argv: list[str] | None = None) -> None:
    argv = sys.argv[1:] if argv is None else argv
    delay = float(os.environ.get("DELAY", "0.8"))
    for job in argv or JOBS:
        run_job(job, delay)
