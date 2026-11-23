"""Moves the project's data between this machine and the `data` release on GitHub.

The code lives in git; the data does not (it is large and changes every day). It is kept as two assets of a release
tagged `data`, overwritten on every update, so no history piles up:

  state.tar.gz      what the scripts need to update the data: the master dataset (~/metal_archives_bands.json),
                    review lists and counts, geography downloads, and the scraper caches (lineups, discographies,
                    iTunes verification)
  site-data.tar.gz  the site's generated JSON (map/site/*.json, c/, r/), which the publish workflow deploys

The published copy of the master dataset leaves out two fields the site never uses: band notes (only whether there
are any is kept, which is what the relevance score needs) and contact e-mails.

Usage (from the repo root; needs the GitHub CLI, `gh`, logged in):
  python3 data.py pull   download both assets and unpack them over the local files
  python3 data.py push   pack the local files and upload them (replacing the release assets)
  python3 data.py pack   only build dist/state.tar.gz and dist/site-data.tar.gz
"""
import json, os, subprocess, sys, tarfile, tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
HOME = os.path.expanduser("~")
DATASET = "metal_archives_bands.json"          # lives in the home folder (see README)
DIST = os.path.join(ROOT, "dist")
TAG = "data"

STATE = ["map/reviews_by_band.json", "map/reviews_pages", "map/reviews_new", "map/geo_dl/admin1.geojson",
         "map/geo_dl/cities1000.txt", "map/geo_dl/admin1Codes.txt", "scraper/members", "scraper/itunes", "scraper/disco"]
SITE = ["bands.json", "index.json", "game.json", "previews.json", "c", "r"]   # inside map/site


def public_dataset(path):
    """The master dataset without notes text and contact e-mails (unused by the site)."""
    bands = json.load(open(os.path.join(HOME, DATASET)))
    for b in bands:
        b["notes"] = "…" if b.get("notes") else None
        b["contact_emails"] = None
    json.dump(bands, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))


def pack():
    os.makedirs(DIST, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        ds = os.path.join(tmp, DATASET)
        public_dataset(ds)
        with tarfile.open(os.path.join(DIST, "state.tar.gz"), "w:gz") as t:
            t.add(ds, arcname=DATASET)
            for p in STATE:
                if os.path.exists(os.path.join(ROOT, p)):
                    t.add(os.path.join(ROOT, p), arcname=p)
    with tarfile.open(os.path.join(DIST, "site-data.tar.gz"), "w:gz") as t:
        for p in SITE:
            t.add(os.path.join(ROOT, "map", "site", p), arcname=p)
    for f in ("state.tar.gz", "site-data.tar.gz"):
        print(f"{f}: {os.path.getsize(os.path.join(DIST, f)) / 1e6:.0f} MB")


def gh(*args):
    subprocess.run(["gh", *args], cwd=ROOT, check=True)


def push():
    pack()
    if subprocess.run(["gh", "release", "view", TAG], cwd=ROOT, capture_output=True).returncode:
        gh("release", "create", TAG, "--prerelease", "--title", "Data snapshot",
           "--notes", "Data for the site and the update scripts, replaced on every update. See data.py and the README.")
    gh("release", "upload", TAG, os.path.join(DIST, "state.tar.gz"), os.path.join(DIST, "site-data.tar.gz"), "--clobber")


def pull(only_site=False):
    os.makedirs(DIST, exist_ok=True)
    names = ["site-data.tar.gz"] if only_site else ["state.tar.gz", "site-data.tar.gz"]
    gh("release", "download", TAG, "--dir", DIST, "--clobber", *sum((["-p", n] for n in names), []))
    with tarfile.open(os.path.join(DIST, "site-data.tar.gz")) as t:
        t.extractall(os.path.join(ROOT, "map", "site"))
    if not only_site:
        with tarfile.open(os.path.join(DIST, "state.tar.gz")) as t:
            for m in t.getmembers():
                dest = HOME if m.name == DATASET else ROOT
                t.extract(m, dest)
    print("pulled:", ", ".join(names))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "pack":
        pack()
    elif cmd == "push":
        push()
    elif cmd == "pull":
        pull(only_site="--site" in sys.argv)
    else:
        sys.exit(__doc__)
