"""Downloads the game clues of the most relevant bands: lineup, photo and logo (one band page each).

Cache: scraper/members/<id>.json = {"h": lineup header, "m": [[name, role], …], "p": photo URL, "lg": logo URL}
No review text: reviews belong to their authors (Metal Archives' webmaster, 2026-11-28), so none is downloaded or kept.
Bands already cached are skipped, so it can be stopped and resumed.

Usage: python3 -m metal_atlas members [N=6000] [threads=3]
"""

import sys
import time
from concurrent.futures import ThreadPoolExecutor

from . import metal_archives as ma
from . import paths
from .jsonio import read_cached, read_json, write_cached
from .net import FetchError, fetch


class MembersScraper:
    def scrape(self, band_id: int) -> bool:
        """Downloads one band (if not cached yet). Returns whether it fetched anything."""
        cached = read_cached(paths.MEMBERS_DIR, band_id)
        if cached and "lg" in cached:
            return False
        page = fetch(ma.band_url(band_id))
        if page is None:
            return False
        write_cached(paths.MEMBERS_DIR, band_id, ma.parse_lineup(page))
        return True

    def safe_scrape(self, band_id: int) -> bool:
        try:
            return self.scrape(band_id)
        except FetchError as e:
            print("skip", band_id, e, flush=True)
            return False


def main(argv: list[str] | None = None) -> None:
    argv = sys.argv[1:] if argv is None else argv
    count = int(argv[0]) if argv else 6000
    threads = int(argv[1]) if len(argv) > 1 else 3
    band_index = read_json(paths.SITE_DIR / "bands.json")
    ids = band_index["id"][:count]
    scraper = MembersScraper()
    started, fetched = time.time(), 0
    with ThreadPoolExecutor(threads) as pool:
        for n, got in enumerate(pool.map(scraper.safe_scrape, ids), 1):
            fetched += got
            if n % 100 == 0:
                print(f"{n}/{len(ids)} fetched={fetched} {time.time() - started:.0f}s", flush=True)
    print("done", len(list(paths.MEMBERS_DIR.glob("*.json"))), "files")
