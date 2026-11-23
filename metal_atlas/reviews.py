"""Downloads Metal Archives' full review list (alphabetical, ~700 pages) and counts reviews per band.

Pages: map/reviews_pages/<letter>_<offset>.json (existing ones are skipped).
Output: map/reviews_by_band.json = {band id: [review count, rating sum]}, the main input of the relevance score.
`update` keeps the counts current afterwards.

Usage: python3 -m metal_atlas reviews
"""

import string
from collections import defaultdict

from . import metal_archives as ma
from . import paths
from .jsonio import read_json, write_json
from .net import fetch_json

LETTERS = ["nbr", *string.ascii_uppercase]
PAGE = 200


def download_letter(letter: str) -> int:
    start, total = 0, None
    while total is None or start < total:
        path = paths.REVIEWS_PAGES_DIR / f"{letter}_{start}.json"
        data = read_json(path)
        if data is None:
            data = fetch_json(ma.reviews_by_letter_url(letter, start))
            write_json(path, data, ensure_ascii=True)
        total = data["iTotalRecords"]
        start += PAGE
    return total


def count_reviews() -> dict[int, list[int]]:
    """Reviews per band, each review once: the list repeats some rows across pages (it shifts while paginating)."""
    counts: dict[int, list[int]] = defaultdict(lambda: [0, 0])
    seen: set[tuple[int, int]] = set()
    for page in sorted(paths.REVIEWS_PAGES_DIR.glob("*.json")):
        for row in read_json(page)["aaData"]:
            review = ma.parse_review_row(row)
            if review and review.key not in seen:
                seen.add(review.key)
                counts[review.band_id][0] += 1
                counts[review.band_id][1] += review.rating
    return counts


def main(argv: list[str] | None = None) -> None:
    for letter in LETTERS:
        print(letter, download_letter(letter), flush=True)
    counts = count_reviews()
    write_json(paths.REVIEWS_BY_BAND, counts, ensure_ascii=True)
    print("bands with reviews", len(counts), "reviews", sum(c for c, _ in counts.values()))
