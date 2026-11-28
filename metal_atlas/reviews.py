"""Downloads Metal Archives' full review list (alphabetical, ~700 pages) and counts reviews per band.

Output: map/reviews_by_band.json = {band id: [review count, rating sum]}, the main input of the relevance score, and
map/review_keys.json = [[album id, user id, band id, rating], …], the reviews counted (no review text or title:
reviews belong to their authors). `update` keeps both current afterwards.

Usage: python3 -m metal_atlas reviews
"""

import string
from collections import defaultdict

from . import metal_archives as ma
from . import paths
from .jsonio import write_json
from .net import fetch_json

LETTERS = ["nbr", *string.ascii_uppercase]
PAGE = 200


def letter_reviews(letter: str) -> list[ma.Review]:
    reviews: list[ma.Review] = []
    start, total = 0, None
    while total is None or start < total:
        data = fetch_json(ma.reviews_by_letter_url(letter, start))
        reviews += [r for row in data["aaData"] if (r := ma.parse_review_row(row))]
        total = data["iTotalRecords"]
        start += PAGE
    return reviews


def count_reviews(reviews: list[ma.Review]) -> tuple[dict[int, list[int]], list[list[int]]]:
    """Reviews per band and the review keys, each review once: the list repeats some rows across pages (it shifts
    while paginating)."""
    counts: dict[int, list[int]] = defaultdict(lambda: [0, 0])
    keys: dict[tuple[int, int], list[int]] = {}
    for review in reviews:
        if review.key not in keys:
            keys[review.key] = [*review.key, review.band_id, review.rating]
            counts[review.band_id][0] += 1
            counts[review.band_id][1] += review.rating
    return counts, list(keys.values())


def main(argv: list[str] | None = None) -> None:
    reviews: list[ma.Review] = []
    for letter in LETTERS:
        reviews += letter_reviews(letter)
        print(letter, len(reviews), flush=True)
    counts, keys = count_reviews(reviews)
    write_json(paths.REVIEWS_BY_BAND, counts, ensure_ascii=True)
    write_json(paths.REVIEW_KEYS, keys, compact=True)
    print("bands with reviews", len(counts), "reviews", sum(c for c, _ in counts.values()))
