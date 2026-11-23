"""Downloads the game clues of the most relevant bands: lineup, photo, logo and a passage of a review.

Cache: scraper/members/<id>.json =
    {"h": lineup header, "m": [[name, role], …], "p": photo URL, "lg": logo URL,
     "r": review passage, "ra": reviewed album, "rs": review rating}
Bands already cached are skipped, so it can be stopped and resumed.

Usage: python3 -m metal_atlas members [N=6000] [threads=3]
"""

import re
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from . import metal_archives as ma
from . import paths
from .jsonio import read_cached, read_json, write_cached
from .net import FetchError, fetch
from .text import fold, strip_html

PASSAGE_MIN, PASSAGE_MAX = 140, 320  # characters
REVIEWS_TRIED = 2  # highest-rated reviews tried per band


@dataclass(order=True)
class ReviewRef:
    rating: int
    url: str
    album: str


def review_index() -> dict[int, list[ReviewRef]]:
    """Band id -> its reviews, from the full review list (reviews_pages)."""
    index: dict[int, list[ReviewRef]] = defaultdict(list)
    for page in paths.REVIEWS_PAGES_DIR.glob("*.json"):
        for row in read_json(page).get("aaData", []):
            url = re.search(r'href="([^"]+/reviews/[^"]+)"', row[1])
            band_id = ma.band_id_in(row[2])
            album = re.search(r">(.*?)</a>", row[3])
            if url and band_id:
                rating = int(row[4].rstrip("%") or 0)
                index[band_id].append(ReviewRef(rating, url.group(1), strip_html(album.group(1)) if album else ""))
    return index


def _name_pattern(name: str) -> re.Pattern:
    """Matches a name as a whole word in folded text."""
    return re.compile(r"(?<![a-z0-9])" + re.escape(fold(name)) + r"(?![a-z0-9])")


def review_passage(page: str, band: str, album: str) -> str | None:
    """140-320 characters of whole sentences that name neither the band nor the album.

    Middle paragraphs first: they tend to describe the sound, while the first and last ones tend to introduce
    the band or sum up.
    """
    m = re.search(r'<div class="reviewContent">(.*?)</div>', page, re.S)
    if not m or len(band) < 3:
        return None
    text = strip_html(m.group(1))
    paragraphs = [re.sub(r"\s+", " ", p).strip() for p in text.split("\n") if len(p.strip()) > 60]
    forbidden = [_name_pattern(x) for x in (band, album) if x and len(x) >= 3]
    forbidden.append(re.compile(re.escape(fold(band).replace(" ", ""))))  # "Iron Maiden" written "IronMaiden"

    def clean(s: str) -> bool:
        return not any(p.search(fold(s)) for p in forbidden)

    if len(paragraphs) > 2:
        paragraphs = paragraphs[1:-1] + paragraphs[:1] + paragraphs[-1:]
    for paragraph in paragraphs:
        sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z\"“'(])", paragraph)
        for first in range(len(sentences)):
            passage = ""
            for sentence in sentences[first:]:
                passage = (passage + " " + sentence).strip()
                if len(passage) > PASSAGE_MAX or not clean(sentence):
                    break
                if len(passage) >= PASSAGE_MIN and clean(passage):
                    return passage
    return None


class MembersScraper:
    def __init__(self, names: dict[int, str], reviews: dict[int, list[ReviewRef]]):
        self.names = names
        self.reviews = reviews

    def scrape(self, band_id: int) -> bool:
        """Downloads one band (if not cached yet). Returns whether it fetched anything."""
        cached = read_cached(paths.MEMBERS_DIR, band_id)
        if cached and "lg" in cached:
            return False
        page = fetch(ma.band_url(band_id))
        if page is None:
            return False
        lineup = ma.parse_lineup(page)
        if cached and "p" in cached:  # older cache: only the logo was missing
            write_cached(paths.MEMBERS_DIR, band_id, {**cached, **lineup})
            return True
        write_cached(paths.MEMBERS_DIR, band_id, {**lineup, **self.passage(band_id)})
        return True

    def passage(self, band_id: int) -> dict:
        for review in sorted(self.reviews.get(band_id, []), reverse=True)[:REVIEWS_TRIED]:
            page = fetch(review.url)
            text = page and review_passage(page, self.names[band_id], review.album)
            if text:
                return {"r": text, "ra": review.album, "rs": review.rating}
        return {"r": None, "ra": None, "rs": None}

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
    scraper = MembersScraper(dict(zip(band_index["id"], band_index["n"])), review_index())
    started, fetched = time.time(), 0
    with ThreadPoolExecutor(threads) as pool:
        for n, got in enumerate(pool.map(scraper.safe_scrape, ids), 1):
            fetched += got
            if n % 100 == 0:
                print(f"{n}/{len(ids)} fetched={fetched} {time.time() - started:.0f}s", flush=True)
    print("done", len(list(paths.MEMBERS_DIR.glob("*.json"))), "files")
