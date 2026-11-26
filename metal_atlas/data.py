"""Moves the project's data between this machine and the `data` release on GitHub.

The code lives in git; the data does not (it is large and changes every day). It is kept as two assets of the
release tagged `data`, overwritten on every update, so no history piles up:

  state.tar.gz      what the steps need to update the data: the master dataset, review lists and counts, geography
                    downloads, and the scraper caches (lineups, discographies, iTunes verification)
  site-data.tar.gz  the site's generated JSON (map/site/*.json, c/, r/), which the publish workflow deploys

The published master dataset leaves out two fields the site never uses: band notes (only whether there are any is
kept, which is what the relevance score needs) and contact e-mails.

Usage (needs the GitHub CLI, `gh`, logged in):
  python3 -m metal_atlas data pull [--site]   download and unpack (--site: only the site data)
  python3 -m metal_atlas data push            pack the local files and upload them
  python3 -m metal_atlas data pack            only build dist/state.tar.gz and dist/site-data.tar.gz
"""

import argparse
import subprocess
import tarfile
import tempfile
import time
from pathlib import Path

from . import paths
from .jsonio import read_json, write_json

TAG = "data"
STATE_ARCHIVE = "state.tar.gz"
SITE_ARCHIVE = "site-data.tar.gz"
DATASET_NAME = "metal_archives_bands.json"  # inside state.tar.gz; unpacked to paths.DATASET

# relative to the repository root
STATE_FILES = [
    paths.REVIEWS_BY_BAND,
    paths.REVIEWS_PAGES_DIR,
    paths.REVIEWS_NEW_DIR,
    paths.GEO_DIR / "admin1.geojson",
    paths.GEO_DIR / "cities1000.txt",
    paths.GEO_DIR / "admin1Codes.txt",
    paths.MEMBERS_DIR,
    paths.ITUNES_DIR,
    paths.DISCO_DIR,
]
RELEASE_NOTES = "Data for the site and the update steps, replaced on every update. See metal_atlas/data.py."
# inside map/site
SITE_FILES = ["bands.json", "index.json", "game.json", "previews.json", "oracle.json", "oracle-albums.json", "c", "r"]


def public_records(bands: list[dict]) -> list[dict]:
    """The dataset without notes text and contact e-mails (unused by the site)."""
    return [{**b, "notes": "…" if b.get("notes") else None, "contact_emails": None} for b in bands]


def pack() -> None:
    paths.DIST_DIR.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        dataset = Path(tmp) / DATASET_NAME
        write_json(dataset, public_records(read_json(paths.DATASET)), compact=True)
        with tarfile.open(paths.DIST_DIR / STATE_ARCHIVE, "w:gz") as tar:
            tar.add(dataset, arcname=DATASET_NAME)
            for path in STATE_FILES:
                if path.exists():
                    tar.add(path, arcname=str(path.relative_to(paths.ROOT)))
    with tarfile.open(paths.DIST_DIR / SITE_ARCHIVE, "w:gz") as tar:
        for name in SITE_FILES:
            tar.add(paths.SITE_DIR / name, arcname=name)
    for name in (STATE_ARCHIVE, SITE_ARCHIVE):
        print(f"{name}: {(paths.DIST_DIR / name).stat().st_size / 1e6:.0f} MB")


UPLOAD_ATTEMPTS = 4  # GitHub's release API sometimes answers 502 (the daily run of 2026-11-25 failed so)


def gh(*args: str, attempts: int = 1, wait: float = 30) -> subprocess.CompletedProcess:
    """Runs gh; retries ``attempts`` times in all, waiting longer each time (``wait`` s, then twice, …)."""
    for attempt in range(1, attempts + 1):
        try:
            return subprocess.run(["gh", *args], cwd=paths.ROOT, check=True)
        except subprocess.CalledProcessError:
            if attempt == attempts:
                raise
            print(f"gh {args[0]} {args[1]} failed (attempt {attempt}/{attempts}), retrying in {wait * attempt:.0f} s")
            time.sleep(wait * attempt)
    raise AssertionError("unreachable")


def push() -> None:
    pack()
    exists = subprocess.run(["gh", "release", "view", TAG], cwd=paths.ROOT, capture_output=True).returncode == 0
    if not exists:
        gh("release", "create", TAG, "--prerelease", "--title", "Data snapshot", "--notes", RELEASE_NOTES)
    for name in (STATE_ARCHIVE, SITE_ARCHIVE):  # one by one, so a retry re-sends only the one that failed
        gh("release", "upload", TAG, str(paths.DIST_DIR / name), "--clobber", attempts=UPLOAD_ATTEMPTS)


def pull(only_site: bool = False) -> None:
    paths.DIST_DIR.mkdir(exist_ok=True)
    names = [SITE_ARCHIVE] if only_site else [STATE_ARCHIVE, SITE_ARCHIVE]
    gh("release", "download", TAG, "--dir", str(paths.DIST_DIR), "--clobber", *[a for n in names for a in ("-p", n)])
    with tarfile.open(paths.DIST_DIR / SITE_ARCHIVE) as tar:
        tar.extractall(paths.SITE_DIR, filter="data")
    if not only_site:
        with tarfile.open(paths.DIST_DIR / STATE_ARCHIVE) as tar:
            for member in tar.getmembers():
                if member.name == DATASET_NAME:
                    tar.extract(member, paths.DATASET.parent, filter="data")
                    (paths.DATASET.parent / DATASET_NAME).replace(paths.DATASET)
                else:
                    tar.extract(member, paths.ROOT, filter="data")
    print("pulled:", ", ".join(names))


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="metal_atlas data", description="Sync the data with the `data` release.")
    parser.add_argument("action", choices=["pull", "push", "pack"])
    parser.add_argument("--site", action="store_true", help="pull: only the site data")
    args = parser.parse_args(argv)
    match args.action:
        case "pull":
            pull(only_site=args.site)
        case "push":
            push()
        case "pack":
            pack()
