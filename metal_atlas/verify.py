"""Links each game band to the right iTunes artist, so namesakes (another "Hydra", another "Graveyard") never play.

For each of the N most relevant bands:
  1. its Metal Archives discography (cache: scraper/disco/<id>.json)
  2. every iTunes artist with exactly the band's name, metal/rock genres first, and their songs (one call)
  3. the artist with the most album titles matching the discography wins (a self-titled album also needs the year
     to match), and only songs from the matching albums are kept, so compilations and namesakes sharing an
     iTunes artist page never play either.
Cache: scraper/itunes/<id>.json = {"a": artist id|null, "c": [album ids], "n": [matched titles],
                                   "t": [[preview, song, album, cover], …], "v": 3}
Bands already verified are skipped, so it can be stopped and resumed.

Usage: python3 -m metal_atlas verify [N=6000] [threads=2]    (ITUNES_GAP: seconds between iTunes calls, default 6)
"""

import html
import os
import re
import sys
import time
import urllib.parse
from collections.abc import Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

from . import metal_archives as ma
from . import paths
from .jsonio import read_cached, read_json, write_cached
from .net import FetchError, ITunes, fetch
from .text import fold

VERSION = 3  # bump to re-verify every band after changing the matching rules
MAX_CANDIDATES = 12  # iTunes artists with the band's name that get compared
MAX_TRACKS = 12  # songs kept per band

_RELEASE_NOISE = re.compile(
    r"\((?:[^)]*)\)|\[(?:[^\]]*)\]|\s-\s(?:ep|single|deluxe.*|remaster.*|re-?issue.*|bonus.*|expanded.*|live)$", re.I
)
_EDITION_WORDS = re.compile(r"\b(remaster(ed)?|deluxe|edition|version|reissue|anniversary)\b")


def title_key(title: str | None) -> str:
    """A comparable album title: "Dreaming Neon Black (Remastered 2004) - EP" -> "dreamingneonblack"."""
    text = _RELEASE_NOISE.sub("", fold(html.unescape(title or "")))
    return re.sub(r"[\W_]+", "", _EDITION_WORDS.sub("", text))


def genre_rank(artist: dict) -> int:
    """0 for metal artists, 1 for related genres, 2 for anything else (tried last)."""
    genre = artist.get("primaryGenreName") or ""
    if re.search(r"metal", genre, re.I):
        return 0
    if re.search(r"rock|punk|grind|core|industrial|alternative|goth|doom", genre, re.I):
        return 1
    return 2


@dataclass
class Match:
    artist_id: int | None = None
    collections: list[int] = field(default_factory=list)
    titles: list[str] = field(default_factory=list)
    tracks: list[list] = field(default_factory=list)

    def as_cache(self) -> dict:
        return {"a": self.artist_id, "c": self.collections, "n": self.titles, "t": self.tracks, "v": VERSION}


def match_artist(band_name: str, discography: list[list], artists: list[dict], songs: Iterable[dict]) -> Match:
    """The candidate artist whose albums best match the Metal Archives discography, with its matching songs.

    discography: [[album id, title, type, year], …]; artists: iTunes artists; songs: iTunes tracks of those artists.
    """
    years_by_title: dict[str, list[int]] = {}
    for _, title, _, year in discography:
        years_by_title.setdefault(title_key(title), []).append(year)
    self_titled = title_key(band_name)
    songs_of: dict[int, list[dict]] = {a["artistId"]: [] for a in artists}
    for song in songs:
        if song.get("wrapperType") == "track" and song.get("artistId") in songs_of:
            songs_of[song["artistId"]].append(song)

    best, best_hits = Match(), 0
    for artist in artists:
        hits: set[str] = set()
        candidate = Match(artist["artistId"])
        seen_songs: set[str] = set()
        for song in songs_of[artist["artistId"]]:
            key = title_key(song.get("collectionName"))
            if not key or key not in years_by_title:
                continue
            year = int((song.get("releaseDate") or "0")[:4] or 0)
            if key == self_titled and not any(abs(year - y) <= 1 for y in years_by_title[key]):
                continue  # a self-titled album only counts if the year matches too
            hits.add(key)
            if song["collectionId"] not in candidate.collections:
                candidate.collections.append(song["collectionId"])
            song_key = fold(song.get("trackName") or "")
            if song.get("previewUrl") and song_key not in seen_songs and len(candidate.tracks) < MAX_TRACKS:
                seen_songs.add(song_key)
                candidate.tracks.append(
                    [song["previewUrl"], song.get("trackName"), song.get("collectionName"), song.get("artworkUrl100")]
                )
        if len(hits) > best_hits and candidate.tracks:
            candidate.titles = sorted(hits)
            best, best_hits = candidate, len(hits)
    return best


class Verifier:
    def __init__(self, names: dict[int, str], itunes: ITunes):
        self.names = names
        self.itunes = itunes

    def discography(self, band_id: int) -> list[list]:
        cached = read_cached(paths.DISCO_DIR, band_id)
        if cached is not None:
            return cached
        rows = ma.parse_discography(fetch(ma.discography_url(band_id)) or "")
        write_cached(paths.DISCO_DIR, band_id, rows)
        return rows

    def candidates(self, name: str) -> list[dict]:
        found = self.itunes.get("search?entity=musicArtist&limit=200&term=" + urllib.parse.quote(name))
        same_name = [a for a in found if fold(a["artistName"]) == fold(name)]
        return sorted(same_name, key=genre_rank)[:MAX_CANDIDATES]  # 40+ "Hydra" on iTunes: metal ones first

    def verify(self, band_id: int) -> Match | None:
        """Verifies one band (if not done yet with the current rules) and caches the result."""
        cached = read_cached(paths.ITUNES_DIR, band_id)
        if cached and cached.get("v") == VERSION:
            return None
        name = self.names[band_id]
        discography = self.discography(band_id)
        artists = self.candidates(name)
        songs = []
        if artists:  # one lookup for every candidate: songs carry their album name, id and date
            ids = ",".join(str(a["artistId"]) for a in artists)
            songs = self.itunes.get(f"lookup?entity=song&limit=200&id={ids}")
        match = match_artist(name, discography, artists, songs)
        write_cached(paths.ITUNES_DIR, band_id, match.as_cache())
        return match

    def safe_verify(self, band_id: int) -> Match | None:
        try:
            return self.verify(band_id)
        except FetchError as e:
            print("skip", band_id, e, flush=True)
            return None


def main(argv: list[str] | None = None) -> None:
    argv = sys.argv[1:] if argv is None else argv
    count = int(argv[0]) if argv else 6000
    threads = int(argv[1]) if len(argv) > 1 else 2
    band_index = read_json(paths.SITE_DIR / "bands.json")
    ids = band_index["id"][:count]
    verifier = Verifier(dict(zip(band_index["id"], band_index["n"])), ITunes(float(os.environ.get("ITUNES_GAP", 6))))
    started, found = time.time(), 0
    with ThreadPoolExecutor(threads) as pool:
        for n, match in enumerate(pool.map(verifier.safe_verify, ids), 1):
            found += bool(match and match.artist_id)
            if n % 100 == 0:
                print(f"{n}/{len(ids)} verified-now={found} {time.time() - started:.0f}s", flush=True)
    print("done")
