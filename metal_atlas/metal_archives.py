"""Metal Archives (metal-archives.com): URLs, and parsers for its pages and JSON lists.

Parsers are pure functions of the HTML/JSON they get, so they can be tested without the network.
"""

import datetime as dt
import html
import re
import urllib.parse
from dataclasses import dataclass

from .text import field_text, split_list, strip_html

BASE = "https://www.metal-archives.com"
STATUSES = ("Active", "On hold", "Split-up", "Unknown", "Changed name", "Disputed")  # index + 1 = search status id
NO_LABEL = "000INDIE000"  # what the dataset stores for unsigned bands

_BAND_ID = re.compile(r'/bands/[^"]*/(\d+)"')
_MONTHS = {m: i for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(), 1)}


# ---------- URLs ----------


def _page_query(start: int, length: int = 200) -> str:
    return f"sEcho=1&iDisplayStart={start}&iDisplayLength={length}"


def band_url(band_id: int) -> str:
    return f"{BASE}/bands/_/{band_id}"


def discography_url(band_id: int) -> str:
    return f"{BASE}/band/discography/id/{band_id}/tab/all"


def advanced_search_url(params: dict, start: int = 0, length: int = 200) -> str:
    """Advanced band search (JSON). Blank yearCreationFrom/To include bands without a formation year."""
    query = {
        "bandName": "*",
        "sEcho": 1,
        "iDisplayStart": start,
        "iDisplayLength": length,
        "iSortCol_0": 0,
        "sSortDir_0": "asc",
        **params,
    }
    return f"{BASE}/search/ajax-advanced/searching/bands/?" + urllib.parse.urlencode(query)


def exact_name_search_url(name: str) -> str:
    query = {"bandName": name, "exactBandMatch": 1, "sEcho": 1, "iDisplayStart": 0, "iDisplayLength": 200}
    return f"{BASE}/search/ajax-advanced/searching/bands/?" + urllib.parse.urlencode(query)


def changes_url(kind: str, year: int, month: int, start: int) -> str:
    """'What's new' (kind="created") or 'What's updated' (kind="modified") for one month, newest first."""
    return (
        f"{BASE}/archives/ajax-band-list/selection/{year}-{month:02d}/by/{kind}//json/1"
        f"?sEcho=1&iDisplayStart={start}&iDisplayLength=200&iSortCol_0=4&sSortDir_0=desc&iSortingCols=1"
    )


def reviews_by_date_url(year: int, month: int, start: int) -> str:
    return f"{BASE}/review/ajax-list-browse/by/date/selection/{year}-{month:02d}?{_page_query(start)}"


def reviews_by_letter_url(letter: str, start: int) -> str:
    return f"{BASE}/review/ajax-list-browse/by/alpha/selection/{letter}?{_page_query(start)}"


# ---------- small pieces ----------


def band_id_in(fragment: str) -> int | None:
    """The band id of the first band link in an HTML fragment."""
    m = _BAND_ID.search(fragment or "")
    return int(m.group(1)) if m else None


_SEARCH_NAME = re.compile(r'<a href="([^"]+)">(.*?)</a>\s*(?:\(<strong>a\.k\.a\.</strong>\s*(.*?)\))?\s*<!--', re.S)


@dataclass
class SearchName:
    """The name cell of an advanced-search result row."""

    url: str
    band_id: int
    name: str
    aka: str | None

    @property
    def aka_list(self) -> list[str] | None:
        return split_list(self.aka) if self.aka else None


def parse_search_name(cell: str) -> SearchName | None:
    m = _SEARCH_NAME.match(cell)
    if not m:
        return None
    url, name, aka = m.groups()
    return SearchName(url, int(url.rstrip("/").rsplit("/", 1)[1]), strip_html(name), strip_html(aka) if aka else None)


def change_time(cell: str, year: int) -> dt.datetime | None:
    """'Nov 22nd, 02:47' -> datetime (the lists omit the year: it is the month being read)."""
    m = re.search(r"([A-Z][a-z]{2}) (\d+)\w*, (\d+):(\d+)", cell)
    if not m:
        return None
    month, day, hour, minute = m.groups()
    return dt.datetime(year, _MONTHS[month], int(day), int(hour), int(minute))


_REVIEW_KEY = re.compile(r'/reviews/.*/(\d+)/[^/"]+/(\d+)"')


def review_key(link: str) -> tuple[int, int] | None:
    """(album id, reviewer id) from a review link, which ends in …/<album id>/<user>/<user id>.

    A user reviews an album only once, so this identifies a review.
    """
    m = _REVIEW_KEY.search(link or "")
    return (int(m.group(1)), int(m.group(2))) if m else None


@dataclass
class Review:
    key: tuple[int, int]
    band_id: int
    rating: int


def parse_review_row(row: list[str]) -> Review | None:
    """A row of a review list: [date or band, link, band, album, "85%", user, time]."""
    key, band_id = review_key(row[1]), band_id_in(row[2])
    if not (key and band_id):
        return None
    pct = re.search(r"(\d+)%", row[4])
    return Review(key, band_id, int(pct.group(1)) if pct else 0)


# ---------- band page ----------


def _dd(page: str, label: str) -> str | None:
    m = re.search(rf"<dt>{re.escape(label)}</dt>\s*<dd[^>]*>(.*?)</dd>", page, re.S)
    return field_text(m.group(1)) if m else None


def parse_band_page(page: str) -> dict | None:
    """The dataset fields of a band page (name, genre, country, location, status, year, themes, label, notes)."""
    h1 = re.search(r'<h1 class="band_name"><a href="([^"]+)">(.*?)</a>', page, re.S)
    if not h1:
        return None
    label = _dd(page, "Current label:") or _dd(page, "Last label:")
    formed = _dd(page, "Formed in:")
    status = _dd(page, "Status:")
    comment = re.search(r'<div class="band_comment clear">(.*?)</div>\s*</div>', page, re.S)
    notes_html = comment.group(1) if comment else ""
    truncated = "btn_read_more" in notes_html  # long notes are cut, with a "Read more" button
    notes_html = re.sub(r'<div class="tool_strip.*', "", notes_html, flags=re.S).replace("\r", "")
    return {
        "url": h1.group(1),
        "name": field_text(h1.group(2)),
        "genre": _dd(page, "Genre:"),
        "country": _dd(page, "Country of origin:"),
        "location": _dd(page, "Location:"),
        "status": status if status in STATUSES else None,
        "formed_in": int(formed) if formed and formed.isdigit() else None,
        "themes": _dd(page, "Themes:"),
        "label": NO_LABEL if (label or "").startswith("Unsigned") else label,
        "notes": field_text(re.sub(r"<!--.*?-->", "", notes_html, flags=re.S)),
        "notes_truncated": truncated,
    }


_LINEUP_ROW = re.compile(
    r'<tr class="lineupHeaders">\s*<td[^>]*>(.*?)</td>'
    r'|<a href="[^"]*/artists/[^"]*" class="bold">(.*?)</a>.*?</td>\s*<td>(.*?)</td>',
    re.S,
)


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def parse_lineup(page: str) -> dict:
    """Lineup, photo and logo of a band page.

    Returns {"h": lineup header ("Current", "Last known"…), "m": [[name, role], …], "p": photo URL, "lg": logo URL}.
    The lineup is the current (or last known) one, else the first listed.
    """
    photo = re.search(r'id="photo"[^>]*href="([^"]+)"', page)
    logo = re.search(r'id="logo"[^>]*href="([^"]+)"', page)
    out = {
        "h": None,
        "m": [],
        "p": html.unescape(photo.group(1)) if photo else None,
        "lg": html.unescape(logo.group(1)) if logo else None,
    }
    start = page.find('id="band_tab_members_all"')
    if start < 0:
        start = page.find('id="band_tab_members_current"')
    if start < 0:
        return out
    end = page.find('id="band_tab_members_live"', start)
    section = page[start : end if end > 0 else start + 200_000]
    groups: list[list] = []
    current = None
    for header, name, role in _LINEUP_ROW.findall(section):
        if header:
            current = [_clean(strip_html(header)), []]
            groups.append(current)
        elif name:
            if current is None:
                current = ["", []]
                groups.append(current)
            role = html.unescape(re.sub(r"<[^>]+>", "", role)).replace("\xa0", " ")
            role = re.sub(r"\s*\([^)]*\)", "", re.sub(r"\s+", " ", role)).strip()
            current[1].append([html.unescape(name).strip(), role])
    if groups:
        chosen = next((g for g in groups if re.match(r"(Current|Last known)", g[0], re.I)), groups[0])
        out["h"], out["m"] = chosen
    return out


_DISCO_ROW = re.compile(
    r'<td><a href="[^"]*/albums/[^"]*/(\d+)" class="[^"]*">(.*?)</a></td>\s*'
    r'<td class="[^"]*">(.*?)</td>\s*<td class="[^"]*">(\d{4})</td>',
    re.S,
)


def parse_discography(page: str) -> list[list]:
    """[[album id, title, type, year], …] from a complete-discography page."""
    return [
        [int(album_id), html.unescape(title).strip(), kind.strip(), int(year)]
        for album_id, title, kind, year in _DISCO_ROW.findall(page or "")
    ]


_AKA = re.compile(r'<a href="[^"]*/(\d+)">.*?</a>\s*\(<strong>a\.k\.a\.</strong>\s*(.*?)\)\s*<!--', re.S)


def parse_aka(rows: list[list[str]], band_id: int) -> tuple[str | None, list[str] | None]:
    """A band's other names, from the rows of an exact-name search (the only place that lists them)."""
    for row in rows:
        m = _AKA.match(row[0])
        if m and int(m.group(1)) == band_id:
            aka = field_text(m.group(2))
            return aka, split_list(aka) if aka else None
    return None, None
