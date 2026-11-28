"""Builds the guessing game's data (site/game.json) and the map's play-button data (site/previews.json).

game.json, for the most relevant bands that have a lineup (`members`), a formation year and, unless --mixed,
iTunes songs verified against their discography (`verify`):
    {"levels": [[row index, …] × 5], "b": [row, …]}
    row = [id, name, slug|0, year, countries, members, lineup header, photo, logo, iTunes artist id,
           [album titles], [[preview, song, album, cover], …], location]
Difficulty levels are slices of the relevance ranking.

previews.json, loaded by the map on the first ▶ click:
    {"t": {band id: [[preview, song, album, cover], …]},   verified songs
     "none": [band id, …],                                  no preview: verified as not on iTunes, or unverified with a
                                                            name shared by another band (a search can't tell them apart)
     "taken": [iTunes artist id, …]}                        artists of verified bands, skipped by the live search

Preview and cover URLs are stored without their common prefix (see shorten_track); index.html expands them.

Usage: python3 -m metal_atlas game [--mixed]
"""

import re
import sys
from collections import Counter

from . import paths
from .jsonio import read_cached, read_json, write_json
from .text import fold

LEVELS = [(0, 250), (250, 800), (800, 2000), (2000, 3800), (3800, 6000)]  # relevance-rank slices
GAME_BANDS = LEVELS[-1][1]
GAME_TRACKS = 5  # per band in the game: variety across replays without bloating game.json
PREVIEW_TRACKS = 3  # per band for the map's play button
ALBUM_TYPES = ("Full-length", "EP")
MAX_ALBUMS = 30
MAX_MEMBERS = 6

AUDIO_PREFIX = "https://audio-ssl.itunes.apple.com/itunes-assets/"
_COVER = re.compile(r"^https://is(\d)-ssl\.mzstatic\.com/image/thumb/(.+)/100x100bb\.jpg$")


def shorten_track(track: list) -> list:
    """[preview URL, song, album, cover URL] with the common URL parts stripped: the cover becomes "<server>|<path>"."""
    url, title, album, cover = track
    m = _COVER.match(cover or "")
    return [url.removeprefix(AUDIO_PREFIX), title, album, f"{m.group(1)}|{m.group(2)}" if m else cover]


def pick_tracks(tracks: list[list], n: int) -> list[list]:
    """Up to n songs, taking one album at a time (round robin) for variety, shortened."""
    queues: dict[str, list] = {}
    for track in tracks:
        queues.setdefault(track[2], []).append(track)
    picked: list[list] = []
    while len(picked) < n and any(queues.values()):
        for queue in queues.values():
            if queue and len(picked) < n:
                picked.append(queue.pop(0))
    return [shorten_track(t) for t in picked]


def album_titles(discography: list | None) -> list[str]:
    """Full-lengths and EPs; if there are none, any release except demos."""
    releases = discography or []
    main = [title for _, title, kind, _ in releases if kind in ALBUM_TYPES]
    return main or [title for _, title, kind, _ in releases if kind != "Demo"]


class GameBuilder:
    def __init__(self, band_index: dict, countries: list[str], locations: dict[int, str | None]):
        self.bi = band_index
        self.countries = countries
        self.locations = locations

    def row(self, i: int, members: dict, itunes: dict | None, tracks: list, discography: list | None) -> list:
        bi, band_id = self.bi, self.bi["id"][i]
        return [
            band_id,
            bi["n"][i],
            bi["s"].get(str(i), 0),
            bi["y"][i],
            " / ".join(self.countries[loc[0]] for loc in bi["l"][i]),
            members["m"][:MAX_MEMBERS],
            members["h"] or "",
            members.get("p"),
            members.get("lg"),
            (itunes or {}).get("a"),
            album_titles(discography)[:MAX_ALBUMS],
            tracks,
            self.locations.get(band_id),
        ]

    def build(self, verified_only: bool = True) -> tuple[dict, dict]:
        """game.json content, and stats {pending, unverified}."""
        levels: list[list[int]] = []
        rows: list[list] = []
        stats = {"pending": 0, "unverified": 0}
        for start, end in LEVELS:
            level = []
            for i in range(start, min(end, len(self.bi["id"]))):
                band_id = self.bi["id"][i]
                members = read_cached(paths.MEMBERS_DIR, band_id)
                if members is None:
                    stats["pending"] += 1
                    continue
                itunes = read_cached(paths.ITUNES_DIR, band_id)
                tracks = pick_tracks((itunes or {}).get("t") or [], GAME_TRACKS)
                stats["unverified"] += not tracks
                if (verified_only and not tracks) or not members["m"] or not self.bi["y"][i]:
                    continue
                level.append(len(rows))
                rows.append(self.row(i, members, itunes, tracks, read_cached(paths.DISCO_DIR, band_id)))
            levels.append(level)
        return {"levels": levels, "b": rows}, stats


def previews(band_index: dict) -> dict:
    """previews.json content (see the module docstring)."""
    songs: dict[int, list] = {}
    not_on_itunes: list[int] = []
    taken: set[int] = set()
    for band_id in band_index["id"][:GAME_BANDS]:
        itunes = read_cached(paths.ITUNES_DIR, band_id)
        if not itunes or itunes.get("v") != 3:
            continue
        if itunes.get("t"):
            songs[band_id] = pick_tracks(itunes["t"], PREVIEW_TRACKS)
            taken.add(itunes["a"])
        else:
            not_on_itunes.append(band_id)
    verified = set(songs) | set(not_on_itunes)
    shared_names = shared_name_bands(band_index["id"], band_index["n"], exclude=verified)
    return {"t": songs, "none": not_on_itunes + shared_names, "taken": sorted(taken)}


def shared_name_bands(ids: list[int], names: list[str], exclude: set[int]) -> list[int]:
    """Bands whose name another band also has (accents and case ignored), except those in ``exclude``."""
    count = Counter(fold(name) for name in names)
    return [band_id for band_id, name in zip(ids, names) if count[fold(name)] > 1 and band_id not in exclude]


def main(argv: list[str] | None = None) -> None:
    argv = sys.argv[1:] if argv is None else argv
    verified_only = "--mixed" not in argv
    band_index = read_json(paths.SITE_DIR / "bands.json")
    countries = [c["name"] for c in read_json(paths.SITE_DIR / "index.json")["countries"]]
    # city / area for the origin clue: the country alone is often too obvious
    locations = {b["id"]: b.get("location") for b in read_json(paths.DATASET)}

    game, stats = GameBuilder(band_index, countries, locations).build(verified_only)
    write_json(paths.SITE_DIR / "game.json", game, compact=True)
    pv = previews(band_index)
    write_json(paths.SITE_DIR / "previews.json", pv, compact=True)

    print(f"previews.json: {len(pv['t'])} bands with songs, {len(pv['none'])} without")
    print(
        "levels:",
        [len(level) for level in game["levels"]],
        "| not downloaded yet:",
        stats["pending"],
        "| without verified songs:",
        stats["unverified"],
        "(excluded)" if verified_only else "(searched live)",
    )
