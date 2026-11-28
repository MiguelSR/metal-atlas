"""Discographies of every band (not only the game bands), for the Oracle.

Store: scraper/discographies.jsonl, one line per download, {"id": band id, "t": unix time, "a": [[album id, title,
type, year], …]}; the latest line of a band wins (`load`), and `compact` rewrites the file with one line per band.
An append-only file survives interruptions: a long download can stop and resume anywhere.

  backfill   download the bands that have none yet, most relevant first (~200,000 at the polite pace: ~3 days);
             resumable, so it can be stopped (Ctrl+C) and restarted at will
  refresh    used by `update`: the bands that changed or were never downloaded, and those with upcoming releases
             not checked for 30 days (no rotation over every band: Metal Archives asked for fewer requests)

Usage: python3 -m metal_atlas discographies backfill [--hours H] [--limit N]
"""

import argparse
import json
import time
from collections.abc import Iterable

from . import metal_archives as ma
from . import paths
from .jsonio import read_cached, read_json, write_cached
from .net import FetchError, fetch, fetch_json

REFRESH_HOURS = 2.0  # time limit of the daily refresh (~2 s per band): the job has 5 hours in all
UPCOMING_RECHECK_DAYS = 30  # a band with an upcoming release is re-checked at most this often


def load() -> dict[int, tuple[float, list]]:
    """band id -> (time checked, albums), the latest line of each band."""
    store: dict[int, tuple[float, list]] = {}
    if paths.DISCOGRAPHIES.exists():
        with paths.DISCOGRAPHIES.open(encoding="utf-8") as f:
            for line in f:
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:  # a line cut by an interruption
                    continue
                store[entry["id"]] = (entry["t"], entry["a"])
    return store


def albums_of(band_id: int, store: dict[int, tuple[float, list]]) -> list | None:
    """A band's albums: the store, else the game-band cache (older scrape), else None (not downloaded yet)."""
    if band_id in store:
        return store[band_id][1]
    return read_cached(paths.DISCO_DIR, band_id)


def download(band_ids: Iterable[int], *, deadline: float | None = None, log_every: int = 500) -> int:
    """Downloads and appends the discographies of ``band_ids``; stops at ``deadline`` (unix time). Returns how many."""
    done = 0
    started = time.time()
    with paths.DISCOGRAPHIES.open("a", encoding="utf-8") as out:
        for band_id in band_ids:
            if deadline and time.time() > deadline:
                break
            try:
                page = fetch(ma.discography_url(band_id))
            except FetchError as error:
                print(f"  skipped {band_id}: {error}", flush=True)
                continue
            albums = ma.parse_discography(page or "")
            out.write(json.dumps({"id": band_id, "t": int(time.time()), "a": albums}, ensure_ascii=False) + "\n")
            out.flush()
            done += 1
            if done % log_every == 0:
                rate = done / (time.time() - started)
                print(f"  {done} discographies ({rate * 3600:.0f}/h)", flush=True)
    return done


def compact(store: dict[int, tuple[float, list]], known: set[int]) -> None:
    """Rewrites the store with one line per band still in the dataset."""
    tmp = paths.DISCOGRAPHIES.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as out:
        for band_id in sorted(store):
            if band_id in known:
                t, albums = store[band_id]
                out.write(json.dumps({"id": band_id, "t": t, "a": albums}, ensure_ascii=False) + "\n")
    tmp.replace(paths.DISCOGRAPHIES)


def upcoming_band_ids() -> set[int]:
    """Bands with an upcoming release (Metal Archives' "upcoming albums" list, every page)."""
    ids: set[int] = set()
    start = 0
    while True:
        data = fetch_json(ma.upcoming_url(start)) or {}
        rows = data.get("aaData", [])
        for row in rows:
            band_id = ma.band_id_in(row[0])
            if band_id:
                ids.add(band_id)
        start += len(rows)
        if not rows or start >= int(data.get("iTotalRecords", 0)):
            return ids


def refresh(changed: Iterable[int], known: set[int], hours: float = REFRESH_HOURS) -> int:
    """`update`'s step: the changed bands and those never downloaded, then the bands with upcoming releases not
    checked for UPCOMING_RECHECK_DAYS, within ``hours`` (what is cut waits for the next run)."""
    deadline = time.time() + hours * 3600
    store = load()
    todo = [b for b in changed if b in known] + sorted(known - set(store))
    try:
        stale = time.time() - UPCOMING_RECHECK_DAYS * 86400
        todo += sorted(b for b in upcoming_band_ids() & known if store.get(b, (0, None))[0] < stale)
    except FetchError as error:
        print(f"  upcoming releases unavailable: {error}", flush=True)
    done = download(dict.fromkeys(todo), deadline=deadline)
    compact(load(), known)
    return done


def copy_to_game_cache(band_ids: Iterable[int]) -> None:
    """The game bands' album clue (scraper/disco/) from the store, so `update` downloads each discography once."""
    store = load()
    for band_id in band_ids:
        if band_id in store and store[band_id][1] and read_cached(paths.MEMBERS_DIR, band_id) is not None:
            write_cached(paths.DISCO_DIR, band_id, store[band_id][1])


def ranked_band_ids() -> list[int]:
    """Every band id, most relevant first (the order of bands.json)."""
    index = read_json(paths.SITE_DIR / "bands.json")
    return list(index["id"])


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="metal_atlas discographies", description=__doc__.split("\n")[0])
    parser.add_argument("action", choices=["backfill", "compact"])
    parser.add_argument("--hours", type=float, help="stop after this many hours")
    parser.add_argument("--limit", type=int, help="download at most this many bands")
    args = parser.parse_args(argv)
    ranked = ranked_band_ids()
    store = load()
    if args.action == "compact":
        compact(store, set(ranked))
        print(f"{len(store)} discographies")
        return
    todo = [b for b in ranked if b not in store]
    if args.limit:
        todo = todo[: args.limit]
    print(f"{len(store)} discographies stored, {len(todo)} to download", flush=True)
    deadline = time.time() + args.hours * 3600 if args.hours else None
    done = download(todo, deadline=deadline)
    print(f"downloaded {done}; {len(todo) - done} left", flush=True)
