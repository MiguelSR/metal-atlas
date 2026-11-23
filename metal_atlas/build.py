"""Builds the map's data (map/site) from the master dataset.

  index.json   genres, and per country: band counts by year and by genre × year (enough to color and filter the map)
  c/<n>.json   the bands of each country, sorted by relevance
  r/<n>.json   the regions of each country (geometry from `regions`) with the same counts per region
  bands.json   every band, sorted by relevance (band search and game)

Usage: python3 -m metal_atlas build
"""

import math
import urllib.parse
from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field

from . import paths
from .countries import INTERNATIONAL, UNKNOWN, band_countries
from .genres import split_genres
from .jsonio import read_json, write_json
from .metal_archives import NO_LABEL, STATUSES

STATUS_CODE = {status: i for i, status in enumerate(STATUSES, 1)}


@dataclass
class Band:
    """A dataset record plus what the build derives from it."""

    raw: dict
    countries: list[str] = field(default_factory=list)
    genres: list[str] = field(default_factory=list)
    score: float = 0.0

    def __getitem__(self, key):
        return self.raw[key]

    @property
    def id(self) -> int:
        return self.raw["id"]

    @property
    def slug(self) -> str | None:
        """The URL slug, or None when it is the default one derived from the name."""
        slug = self.raw["url"].split("/bands/")[1].rsplit("/", 1)[0]
        return None if slug == urllib.parse.quote(self.raw["name"].replace(" ", "_"), safe="") else slug


# ---------- relevance ----------


class Relevance:
    """score = 0.55 reviews + 0.30 age + 0.10 label + 0.05 notes, each scaled to 0..1.

    reviews: log of the number of Metal Archives reviews (the main popularity signal).
    age:     how early the band was added (ids grow over time; the first ones, 2002-2005, are mostly the classics).
    label:   log of the size of the band's label within the dataset (no label = 0).
    notes:   long notes (truncated in the search results) 1, short notes 0.5, none 0.
    """

    def __init__(self, bands: list[dict], reviews: dict[int, list[int]]):
        ids = sorted(b["id"] for b in bands)
        self.rank = {band_id: n for n, band_id in enumerate(ids)}
        self.log_total = math.log(len(ids))
        self.roster = Counter(b["label"] for b in bands if b["label"] and b["label"] != NO_LABEL)
        self.max_roster = math.log1p(max(self.roster.values()))
        self.reviews = reviews
        self.max_reviews = math.log1p(max(count for count, _ in reviews.values()))

    def __call__(self, band: dict) -> float:
        reviews = math.log1p(self.reviews.get(band["id"], [0])[0]) / self.max_reviews
        age = 1 - math.log1p(self.rank[band["id"]]) / self.log_total
        label = math.log1p(self.roster.get(band["label"], 0)) / self.max_roster if band["label"] in self.roster else 0
        notes = 1 if band["notes_truncated"] else (0.5 if band["notes"] else 0)
        return 0.55 * reviews + 0.3 * age + 0.1 * label + 0.05 * notes


# ---------- counts ----------


def counts(bands: Iterable[Band], genre_index: dict[str, int]) -> dict:
    """{"y": {year: [bands, active]}, "g": {genre: {year: bands}}}; year 0 = unknown."""
    years: dict[int, list[int]] = defaultdict(lambda: [0, 0])
    cube: dict[int, dict[int, int]] = defaultdict(lambda: defaultdict(int))
    for b in bands:
        year = b["formed_in"] or 0
        years[year][0] += 1
        years[year][1] += b["status"] == "Active"
        for g in b.genres:
            cube[genre_index[g]][year] += 1
    return {
        "y": {str(y): v for y, v in sorted(years.items())},
        "g": {str(g): {str(y): n for y, n in sorted(ys.items())} for g, ys in cube.items()},
    }


# ---------- output ----------


class SiteBuilder:
    def __init__(self, bands: list[Band], band_regions: dict, country_codes: dict, reviews: dict[int, list[int]]):
        self.bands = bands
        self.band_regions = band_regions
        self.country_codes = country_codes
        self.reviews = reviews
        genre_counts = Counter(g for b in bands for g in b.genres)
        self.genres = [g for g, _ in genre_counts.most_common()]
        self.genre_index = {g: i for i, g in enumerate(self.genres)}
        self.by_country: dict[str, list[Band]] = defaultdict(list)
        for b in bands:
            for c in b.countries:
                self.by_country[c].append(b)
        self.countries = sorted(self.by_country, key=lambda c: -len(self.by_country[c]))

    def regions_of(self, band: Band, country: str) -> list[int]:
        return self.band_regions.get(str(band.id), {}).get(country, [])

    def write(self, site) -> None:
        for folder in ("c", "r"):
            for old in (site / folder).glob("*.json"):
                old.unlink()
        index = {"genres": self.genres, "countries": []}
        for file_no, country in enumerate(self.countries):
            bands = sorted(self.by_country[country], key=lambda b: -b.score)
            has_regions = self._write_regions(site, file_no, country, bands)
            index["countries"].append(
                {
                    "name": country,
                    "file": file_no,
                    "r": has_regions,
                    "cc": self.country_codes.get(country),
                    **counts(bands, self.genre_index),
                }
            )
            write_json(site / "c" / f"{file_no}.json", self._country_rows(country, bands), compact=True)
        write_json(site / "index.json", index, compact=True)
        write_json(site / "bands.json", self._band_index(), compact=True)

    def _write_regions(self, site, file_no: int, country: str, bands: list[Band]) -> bool:
        geo = read_json(paths.REGIONS_DIR / "geo" / f"{country}.json")
        if geo is None:
            return False
        per_region: list[list[Band]] = [[] for _ in geo["regions"]]
        for b in bands:
            for r in self.regions_of(b, country):
                per_region[r].append(b)
        geo["cubes"] = [counts(bs, self.genre_index) for bs in per_region]
        geo["unassigned"] = sum(1 for b in bands if not self.regions_of(b, country))
        write_json(site / "r" / f"{file_no}.json", geo, compact=True)
        return True

    def _country_rows(self, country: str, bands: list[Band]) -> dict:
        """{"labels": [...], "rows": [[id, name, slug|0, year, status, label idx|-1, genre, [genre idx],
        reviews, avg rating, [regions]], ...]}"""
        labels: list[str] = []
        label_index: dict[str, int] = {}
        rows = []
        for b in bands:
            label = b["label"]
            if label in (None, NO_LABEL):
                label_no = -1
            else:
                label_no = label_index.setdefault(label, len(labels))
                if label_no == len(labels):
                    labels.append(label)
            count, rating_sum = self.reviews.get(b.id, [0, 0])
            rows.append(
                [
                    b.id,
                    b["name"],
                    b.slug or 0,
                    b["formed_in"] or 0,
                    STATUS_CODE.get(b["status"], 0),
                    label_no,
                    b["genre"],
                    [self.genre_index[g] for g in b.genres],
                    count,
                    round(rating_sum / count) if count else 0,
                    self.regions_of(b, country),
                ]
            )
        return {"labels": labels, "rows": rows}

    def _band_index(self) -> dict:
        """Parallel columns over every band, most relevant first."""
        country_index = {c: i for i, c in enumerate(self.countries)}
        ranked = sorted(self.bands, key=lambda b: -b.score)
        return {
            "n": [b["name"] for b in ranked],
            "y": [b["formed_in"] or 0 for b in ranked],
            "a": "".join("1" if b["status"] == "Active" else "0" for b in ranked),
            "g": [[self.genre_index[g] for g in b.genres] for b in ranked],
            "l": [[[country_index[c], *self.regions_of(b, c)] for c in b.countries] for b in ranked],
            "id": [b.id for b in ranked],
            "s": {i: b.slug for i, b in enumerate(ranked) if b.slug},
        }


def load_bands() -> tuple[list[Band], dict[int, list[int]]]:
    """The dataset with countries, genres and relevance, and the review counts."""
    raw = read_json(paths.DATASET)
    reviews = {int(k): v for k, v in read_json(paths.REVIEWS_BY_BAND).items()}
    known = {b["country"] for b in raw} - {INTERNATIONAL, UNKNOWN}
    relevance = Relevance(raw, reviews)
    bands = [
        Band(b, band_countries(b["country"], b.get("location"), known), split_genres(b["genre"]), relevance(b))
        for b in raw
    ]
    return bands, reviews


def main(argv: list[str] | None = None) -> None:
    bands, reviews = load_bands()
    builder = SiteBuilder(
        bands, read_json(paths.REGIONS_DIR / "band_regions.json"), read_json(paths.MA_COUNTRIES), reviews
    )
    builder.write(paths.SITE_DIR)
    print("countries", len(builder.countries), "genres", len(builder.genres))
