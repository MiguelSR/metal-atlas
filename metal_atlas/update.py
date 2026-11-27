"""Brings the data up to date with Metal Archives, then rebuilds the site.

  1. Changes: the "What's new" and "What's updated" lists, month by month and page by page (newest first), back to
     the last update (minus a day of overlap, to be safe); and the monthly "latest reviews" list, for the review
     count of every band.
  2. One request per new or changed band: its band page. New bands also get an exact-name search (the only place
     with their a.k.a.); game bands also refresh their lineup, photo, logo and discography. Bands whose page is gone
     (deleted) are removed.
  3. Discographies, for the Oracle: the changed bands, those with upcoming releases, and the 1,000 least recently
     checked, within two hours (see discographies.py).
  4. Rebuild: regions -> build -> members + verify (bands new to the game) -> game -> oracle (the publish workflow
     then builds the front end and bundles the site).

State: map/update_state.json = {"since": "YYYY-MM-DD HH:MM"} (Metal Archives server time).

Usage: python3 -m metal_atlas update [--since YYYY-MM-DD] [--dry-run]
"""

import argparse
import datetime as dt
import shutil
import time
from collections.abc import Iterator
from dataclasses import dataclass, field

from . import build, discographies, game, members, oracle, regions, verify
from . import metal_archives as ma
from . import paths
from .jsonio import read_cached, read_json, write_cached, write_json
from .merge import FIELDS, contact_emails
from .net import fetch, fetch_json

FIRST_SINCE = dt.datetime(2026, 11, 21)  # the full scrape
OVERLAP = dt.timedelta(days=1)
PAGE = 200


def months(since: dt.datetime, until: dt.datetime) -> Iterator[tuple[int, int]]:
    """(year, month) from since's month to until's month, inclusive."""
    year, month = since.year, since.month
    while (year, month) <= (until.year, until.month):
        yield year, month
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)


def start_date(state: dict | None, override: str | None) -> dt.datetime:
    if override:
        return dt.datetime.fromisoformat(override)
    last = dt.datetime.fromisoformat(state["since"]) if state else FIRST_SINCE
    return last - OVERLAP


def read_changes(kind: str, since: dt.datetime, now: dt.datetime) -> dict[int, dt.datetime]:
    """{band id: newest change} from one list ("created" or "modified")."""
    changed: dict[int, dt.datetime] = {}
    for year, month in months(since, now):
        start, total = 0, None
        while total is None or start < total:
            data = fetch_json(ma.changes_url(kind, year, month, start))
            total = data["iTotalRecords"]
            reached_since = False
            for row in data["aaData"]:
                when, band_id = ma.change_time(row[4], year), ma.band_id_in(row[1])
                if not (when and band_id):
                    continue
                if when < since:
                    reached_since = True
                    break
                changed[band_id] = max(changed.get(band_id, when), when)
            print(
                f"  {kind} {year}-{month:02d}: {min(start + PAGE, total)}/{total} read, {len(changed)} bands",
                flush=True,
            )
            if reached_since:
                break  # newest first: the rest is older than the last update
            start += PAGE
    return changed


@dataclass
class NewReviews:
    pages: dict[str, dict] = field(default_factory=dict)  # file name -> list page, kept in reviews_new/
    reviews: list[ma.Review] = field(default_factory=list)


def known_review_keys() -> set[tuple[int, int]]:
    """Reviews already counted: the full review list plus the monthly lists read by earlier updates."""
    keys: set[tuple[int, int]] = set()
    for folder in (paths.REVIEWS_PAGES_DIR, paths.REVIEWS_NEW_DIR):
        for page in folder.glob("*.json"):
            keys.update(k for row in read_json(page)["aaData"] if (k := ma.review_key(row[1])))
    return keys


def read_new_reviews(since: dt.datetime, now: dt.datetime, known: set[tuple[int, int]]) -> NewReviews:
    found = NewReviews()
    for year, month in months(since, now):
        start, total = 0, None
        while total is None or start < total:
            data = fetch_json(ma.reviews_by_date_url(year, month, start))
            total = data["iTotalRecords"]
            found.pages[f"{year}-{month:02d}_{start}.json"] = data
            for row in data["aaData"]:
                review = ma.parse_review_row(row)
                if review and review.key not in known:
                    known.add(review.key)
                    found.reviews.append(review)
            start += PAGE
        print(f"  reviews {year}-{month:02d}: {total} this month", flush=True)
    return found


@dataclass
class BandChanges:
    added: int = 0
    updated: int = 0
    removed: int = 0


class DatasetUpdater:
    """Applies band pages to the dataset (``by_id``) and refreshes the caches of game bands."""

    def __init__(self, bands: list[dict]):
        self.by_id = {b["id"]: b for b in bands}
        self.changes = BandChanges()

    def refresh(self, band_id: int) -> None:
        page = fetch(ma.band_url(band_id))
        if page is None:  # 404: deleted from Metal Archives
            if self.by_id.pop(band_id, None) is not None:
                self.changes.removed += 1
            return
        fields = ma.parse_band_page(page)
        if fields is None:
            return
        band = self.by_id.get(band_id)
        if band is None:
            band = self.by_id[band_id] = {"id": band_id, "contact_emails": None}
            band["aka"], band["aka_list"] = ma.parse_aka(
                (fetch_json(ma.exact_name_search_url(fields["name"])) or {}).get("aaData", []), band_id
            )
            self.changes.added += 1
        else:
            self.changes.updated += 1
        band.update(fields)
        band["contact_emails"] = contact_emails(fields["notes"]) or band.get("contact_emails")
        self.refresh_game_band(band_id, page)

    @staticmethod
    def refresh_game_band(band_id: int, page: str) -> None:
        """Game bands (those with a members cache): fresh discography (album clue), lineup, photo and logo."""
        cached = read_cached(paths.MEMBERS_DIR, band_id)
        if cached is None:
            return
        albums = ma.parse_discography(fetch(ma.discography_url(band_id)) or "")
        if albums:
            write_cached(paths.DISCO_DIR, band_id, albums)
        write_cached(paths.MEMBERS_DIR, band_id, {**cached, **ma.parse_lineup(page)})  # keeps the review passage

    def records(self) -> list[dict]:
        return [{key: self.by_id[i].get(key) for key in FIELDS} for i in sorted(self.by_id)]


def save_reviews(found: NewReviews) -> None:
    counts = read_json(paths.REVIEWS_BY_BAND)
    for review in found.reviews:  # review count and rating sum drive the relevance ranking
        entry = counts.setdefault(str(review.band_id), [0, 0])
        entry[0] += 1
        entry[1] += review.rating
    write_json(paths.REVIEWS_BY_BAND, counts, ensure_ascii=True)
    for name, page in found.pages.items():  # remember which reviews are counted now
        write_json(paths.REVIEWS_NEW_DIR / name, page, ensure_ascii=True)


def rebuild() -> None:
    steps = [
        ("regions", regions.main, []),
        ("build", build.main, []),
        ("members", members.main, [str(game.GAME_BANDS), "3"]),
        ("verify", verify.main, [str(game.GAME_BANDS), "2"]),
        ("game", game.main, []),
        ("oracle", oracle.main, []),
        # no `bundle`: it needs the compiled front end, which the publish workflow builds (pages.yml)
    ]
    for name, step, args in steps:
        print("->", name, *args, flush=True)
        step(args)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="metal_atlas update", description=__doc__.split("\n")[0])
    parser.add_argument("--since", help="read changes from this date (YYYY-MM-DD) instead of the last update")
    parser.add_argument("--dry-run", action="store_true", help="only count the changes")
    args = parser.parse_args(argv)

    now = dt.datetime.now()
    since = start_date(read_json(paths.UPDATE_STATE), args.since)
    print(f"changes since {since:%Y-%m-%d %H:%M} (Metal Archives time)", flush=True)
    new, modified = read_changes("created", since, now), read_changes("modified", since, now)
    todo = sorted(set(new) | set(modified))
    print(f"{len(new)} new, {len(modified)} updated -> {len(todo)} bands to download", flush=True)
    found = read_new_reviews(since, now, known_review_keys())
    print(f"{len(found.reviews)} new reviews", flush=True)
    if args.dry_run or not (todo or found.reviews):
        return

    updater = DatasetUpdater(read_json(paths.DATASET))
    started = time.time()
    for n, band_id in enumerate(todo, 1):
        updater.refresh(band_id)
        if n % 100 == 0:
            eta = (time.time() - started) / n * (len(todo) - n)
            print(f"  {n}/{len(todo)} band pages, about {eta / 60:.0f} min left", flush=True)

    backup = paths.DATASET.with_name(paths.DATASET.name + ".bak")
    shutil.copy(paths.DATASET, backup)
    write_json(paths.DATASET, updater.records(), indent=1)
    save_reviews(found)
    c = updater.changes
    print(f"reviews: +{len(found.reviews)} for {len({r.band_id for r in found.reviews})} bands", flush=True)
    print(
        f"dataset: +{c.added} new, {c.updated} updated, -{c.removed} deleted -> {len(updater.by_id)} bands "
        f"(previous copy: {backup})",
        flush=True,
    )
    print("-> discographies", flush=True)
    done = discographies.refresh(todo, set(updater.by_id))
    print(f"discographies: {done} downloaded", flush=True)

    rebuild()
    if new or modified:
        newest = max([*new.values(), *modified.values()])
        write_json(paths.UPDATE_STATE, {"since": f"{newest:%Y-%m-%d %H:%M}"}, ensure_ascii=True)
        print(f"done. Next run picks up changes after {newest:%Y-%m-%d %H:%M}.", flush=True)
