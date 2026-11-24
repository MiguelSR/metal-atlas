"""Builds the Oracle's data: site/oracle.json (every band with the fields the Oracle can ask about, plus the lineups
scraped for the game bands) and site/oracle-albums.json (discographies, loaded by the page only when a question needs
them: `discographies` downloads them for every band; until then, the game bands' from `verify`).

The Oracle (web/src/oracle) asks an in-browser language model to turn a question into a structured query, and runs
that query on this file. Rows are sorted by relevance, like bands.json, so "the most relevant" is row order.

    {"v": 1,
     "genres": [normalized genre, …], "countries": [country, …],
     "dicts": {"genre": [genre as written, …], "location": […], "themes": […], "label": […]},
     "id": […], "name": […], "slug": {row: slug},           slug only when it differs from the name's
     "year": […] (0 = unknown), "status": […] (index in STATUSES + 1, 0 = unknown),
     "genre": [dict index], "g": [[normalized genre index], …], "country": [[country index], …],
     "location": [dict index], "themes": [dict index], "label": [dict index | -1],
     "reviews": […], "rating": […] (average %, 0 = no reviews),
     "lineups": {row: [header, [[name, role], …]]}}         current (or last known) lineup, game bands only

    oracle-albums.json: {"v": 1, "a": [albums | 0, …]}, one item per row of oracle.json (same order):
    [[album id, title, type, year], …], or 0 when the discography isn't known

Usage: python3 -m metal_atlas oracle
"""

from . import discographies, paths
from .build import STATUS_CODE, Band, load_bands
from .jsonio import read_cached, write_json
from .metal_archives import NO_LABEL

VERSION = 1


class Dictionary:
    """Distinct values numbered in order of appearance; None (and empty) is -1."""

    def __init__(self) -> None:
        self.values: list[str] = []
        self._index: dict[str, int] = {}

    def __call__(self, value: str | None) -> int:
        if not value:
            return -1
        if value not in self._index:
            self._index[value] = len(self.values)
            self.values.append(value)
        return self._index[value]


def oracle_data(bands: list[Band], reviews: dict[int, list[int]], members_dir=None, albums_of=None) -> dict:
    """oracle.json's content, with the albums of each row under "albums" (split off by `main`)."""
    members_dir = members_dir or paths.MEMBERS_DIR
    if albums_of is None:
        store = discographies.load()
        albums_of = lambda band_id: discographies.albums_of(band_id, store)  # noqa: E731
    ranked = sorted(bands, key=lambda b: -b.score)
    genre_names = sorted({g for b in ranked for g in b.genres})
    genre_index = {g: i for i, g in enumerate(genre_names)}
    country_names = sorted({c for b in ranked for c in b.countries})
    country_index = {c: i for i, c in enumerate(country_names)}
    dicts = {name: Dictionary() for name in ("genre", "location", "themes", "label")}
    data: dict = {
        "v": VERSION,
        "genres": genre_names,
        "countries": country_names,
        **{key: [] for key in ("id", "name", "year", "status", "genre", "g", "country", "location", "themes")},
        **{key: [] for key in ("label", "reviews", "rating")},
        "slug": {},
        "lineups": {},
        "albums": [],
    }
    for row, b in enumerate(ranked):
        count, rating_sum = reviews.get(b.id, [0, 0])
        data["id"].append(b.id)
        data["name"].append(b["name"])
        if b.slug:
            data["slug"][row] = b.slug
        data["year"].append(b["formed_in"] or 0)
        data["status"].append(STATUS_CODE.get(b["status"], 0))
        data["genre"].append(dicts["genre"](b["genre"]))
        data["g"].append([genre_index[g] for g in b.genres])
        data["country"].append([country_index[c] for c in b.countries])
        data["location"].append(dicts["location"](b["location"]))
        data["themes"].append(dicts["themes"](b["themes"]))
        data["label"].append(-1 if b["label"] == NO_LABEL else dicts["label"](b["label"]))
        data["reviews"].append(count)
        data["rating"].append(round(rating_sum / count) if count else 0)
        lineup = read_cached(members_dir, b.id)
        if lineup and lineup.get("m"):
            data["lineups"][row] = [lineup.get("h") or "", lineup["m"]]
        albums = albums_of(b.id)
        data["albums"].append(albums if albums is not None else 0)
    data["dicts"] = {name: d.values for name, d in dicts.items()}
    return data


def main(argv: list[str] | None = None) -> None:
    bands, reviews = load_bands()
    data = oracle_data(bands, reviews)
    albums = data.pop("albums")
    write_json(paths.SITE_DIR / "oracle.json", data, compact=True)
    write_json(paths.SITE_DIR / "oracle-albums.json", {"v": VERSION, "a": albums}, compact=True)
    known = sum(1 for a in albums if a != 0)
    print(f"oracle: {len(data['id'])} bands, {len(data['lineups'])} lineups, {known} discographies")
