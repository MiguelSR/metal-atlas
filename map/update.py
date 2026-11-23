"""Brings the dataset up to date with Metal Archives' "What's new" and "What's updated" lists, then rebuilds everything.

  1. Reads both lists (archives/ajax-band-list/selection/<YYYY-MM>/by/created|modified), month by month and page by page
     (newest first), until it reaches the last update date (minus a day of overlap, to be safe).
     Also reads the monthly "latest reviews" list (a page or two per month) to update every band's review count.
  2. For every new or changed band, 1 request: its band page. New bands also get an exact-name search (the only
     place with their a.k.a.); game bands also refresh lineup/photo/logo and their discography (album clue).
     Updates ~/metal_archives_bands.json and reviews_by_band.json (a band whose page is gone, i.e. deleted, is removed).
  3. Rebuilds: regions.py -> build.py -> members.py + verify.py (only bands that are new to the top 6000) -> game.py -> make_netlify.py

State: map/update_state.json = {"since": "YYYY-MM-DD HH:MM"} (Metal Archives server time).
Usage: python3 update.py                    # since the last run
       python3 update.py --since 2026-11-20  # from a given date
       python3 update.py --dry-run           # only list what changed, touch nothing
"""
import json, os, re, sys, html, time, shutil, subprocess, urllib.parse, datetime as dt

HERE = os.path.dirname(os.path.abspath(__file__))
SCR = os.path.join(HERE, "..", "scraper")
DATA = os.path.expanduser("~/metal_archives_bands.json")
STATE = os.path.join(HERE, "update_state.json")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
DELAY = 0.8
FIRST_SINCE = "2026-11-21 00:00"   # the full scrape was done on 2026-11-21

args = sys.argv[1:]
DRY = "--dry-run" in args
since_arg = args[args.index("--since") + 1] if "--since" in args else None


def curl(url, ajax=False):
    """GET with retries. Returns the body, or None on 404."""
    cmd = ["curl", "-s", "-w", "\n%{http_code}", "-A", UA] + (["-H", "X-Requested-With: XMLHttpRequest"] if ajax else []) + [url]
    for attempt in range(8):
        r = subprocess.run(cmd, capture_output=True, timeout=180)
        body, _, code = r.stdout.rpartition(b"\n")
        if code == b"200":
            time.sleep(DELAY)
            return body.decode("utf-8", "replace")
        if code == b"404":
            return None
        wait = min(300, 10 * 2 ** attempt)
        print(f"  HTTP {code.decode()} {url[:90]}, retry in {wait}s", flush=True)
        time.sleep(wait)
    raise RuntimeError(f"failed {url}")


# ---------- 1. what changed ----------
MONTHS = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
TS = re.compile(r"([A-Z][a-z]{2}) (\d+)\w*, (\d+):(\d+)")
BID = re.compile(r'/bands/[^"]*/(\d+)"')


def changed(kind, since):
    """{band id: newest timestamp} from one list, from `since` to now."""
    out, now = {}, dt.datetime.now()
    y, m = since.year, since.month
    while (y, m) <= (now.year, now.month):
        start, total = 0, None
        while total is None or start < total:
            url = (f"https://www.metal-archives.com/archives/ajax-band-list/selection/{y}-{m:02d}/by/{kind}//json/1"
                   f"?sEcho=1&iDisplayStart={start}&iDisplayLength=200&iSortCol_0=4&sSortDir_0=desc&iSortingCols=1")
            d = json.loads(curl(url, ajax=True), strict=False)
            total = d["iTotalRecords"]
            older = False
            for row in d["aaData"]:
                t, b = TS.search(row[4]), BID.search(row[1])
                if not (t and b):
                    continue
                ts = dt.datetime(y, MONTHS[t.group(1)], int(t.group(2)), int(t.group(3)), int(t.group(4)))
                if ts < since:
                    older = True
                    break
                bid = int(b.group(1))
                out[bid] = max(out.get(bid, ts), ts)
            print(f"  {kind} {y}-{m:02d}: {min(start + 200, total)}/{total} read, {len(out)} bands", flush=True)
            if older:
                break          # newest first: everything after this is older than the last update
            start += 200
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


state = json.load(open(STATE)) if os.path.exists(STATE) else {"since": FIRST_SINCE}
since = dt.datetime.fromisoformat(since_arg) if since_arg else dt.datetime.fromisoformat(state["since"]) - dt.timedelta(days=1)
print(f"changes since {since:%Y-%m-%d %H:%M} (Metal Archives time)", flush=True)
new, mod = changed("created", since), changed("modified", since)
todo = sorted(set(new) | set(mod))
print(f"{len(new)} new, {len(mod)} updated -> {len(todo)} bands to download", flush=True)

# new reviews: one monthly list ("latest reviews"), usually a page or two. A review link ends in
# .../<album id>/<user>/<user id>, and a user reviews an album only once, so (album id, user id) identifies a review:
# the ones already counted (full review scrape in reviews_pages/ + earlier updates in reviews_new/) are skipped.
_REV = re.compile(r'/reviews/.*/(\d+)/[^/"]+/(\d+)"')


def rev_key(link):
    m = _REV.search(link or "")
    return (int(m.group(1)), int(m.group(2))) if m else None


REV_BAND = re.compile(r'/bands/[^"]*/(\d+)"')
NEWDIR = os.path.join(HERE, "reviews_new")
known = set()
for folder in ("reviews_pages", "reviews_new"):
    p = os.path.join(HERE, folder)
    for f in os.listdir(p) if os.path.isdir(p) else []:
        known.update(k for r in json.load(open(os.path.join(p, f)))["aaData"] if (k := rev_key(r[1])))
rev_pages, fresh = {}, []
y, m = since.year, since.month
while (y, m) <= (dt.datetime.now().year, dt.datetime.now().month):
    start, total = 0, None
    while total is None or start < total:
        d = json.loads(curl(f"https://www.metal-archives.com/review/ajax-list-browse/by/date/selection/{y}-{m:02d}"
                            f"?sEcho=1&iDisplayStart={start}&iDisplayLength=200", ajax=True), strict=False)
        total = d["iTotalRecords"]
        rev_pages[f"{y}-{m:02d}_{start}.json"] = d
        for r in d["aaData"]:
            rid, rb, pct = rev_key(r[1]), REV_BAND.search(r[2]), re.search(r"(\d+)%", r[4])
            if rid and rb and rid not in known:
                known.add(rid)
                fresh.append((int(rb.group(1)), int(pct.group(1)) if pct else 0))
        start += 200
    print(f"  reviews {y}-{m:02d}: {total} this month", flush=True)
    y, m = (y + 1, 1) if m == 12 else (y, m + 1)
print(f"{len(fresh)} new reviews", flush=True)
if DRY or not (todo or fresh):
    sys.exit()

# ---------- 2. band pages ----------
STATUS = {"Active", "On hold", "Split-up", "Unknown", "Changed name", "Disputed"}


def txt(s):
    s = html.unescape(re.sub(r"<[^>]+>", "", re.sub(r"<br\s*/?>", "\n", s or ""))).strip()
    return None if s in ("", "N/A") else s


def field(page, label):
    m = re.search(rf"<dt>{re.escape(label)}</dt>\s*<dd[^>]*>(.*?)</dd>", page, re.S)
    return txt(m.group(1)) if m else None


def parse(page):
    h1 = re.search(r'<h1 class="band_name"><a href="([^"]+)">(.*?)</a>', page, re.S)
    if not h1:
        return None
    label = field(page, "Current label:") or field(page, "Last label:")
    formed = field(page, "Formed in:")
    com = re.search(r'<div class="band_comment clear">(.*?)</div>\s*</div>', page, re.S)
    body = com.group(1) if com else ""
    more = "btn_read_more" in body                       # long notes, cut with a "Read more" button
    body = re.sub(r'<div class="tool_strip.*', "", body, flags=re.S).replace("\r", "")
    notes = txt(re.sub(r"<!--.*?-->", "", body, flags=re.S))
    status = field(page, "Status:")
    return {"url": h1.group(1), "name": txt(h1.group(2)), "genre": field(page, "Genre:"), "country": field(page, "Country of origin:"),
            "location": field(page, "Location:"), "status": status if status in STATUS else None,
            "formed_in": int(formed) if formed and formed.isdigit() else None, "themes": field(page, "Themes:"),
            "label": "000INDIE000" if (label or "").startswith("Unsigned") else label,
            "notes": notes, "notes_truncated": more}


DISCO_ROW = re.compile(r'<td><a href="[^"]*/albums/[^"]*/(\d+)" class="[^"]*">(.*?)</a></td>\s*<td class="[^"]*">(.*?)</td>\s*'
                       r'<td class="[^"]*">(\d{4})</td>', re.S)
AKA = re.compile(r'<a href="[^"]*/(\d+)">.*?</a>\s*\(<strong>a\.k\.a\.</strong>\s*(.*?)\)\s*<!--', re.S)


def discography(bid):
    """Game bands only: the complete discography, for the album clue."""
    page = curl(f"https://www.metal-archives.com/band/discography/id/{bid}/tab/all") or ""
    return [[int(a), html.unescape(t).strip(), ty.strip(), int(y)] for a, t, ty, y in DISCO_ROW.findall(page)]


def aka(bid, name):
    """New bands only: exact-name search, the only place that lists the band's other names (a.k.a.)."""
    q = urllib.parse.urlencode({"bandName": name, "exactBandMatch": 1, "sEcho": 1, "iDisplayStart": 0, "iDisplayLength": 200})
    d = json.loads(curl("https://www.metal-archives.com/search/ajax-advanced/searching/bands/?" + q, ajax=True) or "{}", strict=False)
    for row in d.get("aaData", []):
        m = AKA.match(row[0])
        if m and int(m.group(1)) == bid:
            s = txt(m.group(2))
            return s, [a.strip() for a in re.split(r"[;,]", s) if a.strip()]
    return None, None


RV_PATH = os.path.join(HERE, "reviews_by_band.json")
RV = json.load(open(RV_PATH))
sys.path.insert(0, SCR)
sys.argv = [sys.argv[0]]          # members.py reads its own argv when imported
import members                     # noqa: E402  (parse_band: lineup / photo / logo)

bands = json.load(open(DATA))
by_id = {b["id"]: b for b in bands}
added = updated = removed = 0
t0 = time.time()
for n, bid in enumerate(todo, 1):
    page = curl(f"https://www.metal-archives.com/bands/_/{bid}")
    d = parse(page) if page else None
    if d is None:
        if page is None and bid in by_id:      # 404: deleted from Metal Archives
            del by_id[bid]; removed += 1
        continue
    b = by_id.get(bid)
    if b is None:
        b = by_id[bid] = {"id": bid, "contact_emails": None}
        b["aka"], b["aka_list"] = aka(bid, d["name"])
        added += 1
    else:
        updated += 1
    b.update(d)
    mp = os.path.join(SCR, "members", f"{bid}.json")
    if os.path.exists(mp):                     # a game band: fresh album list for the album clue
        albums = discography(bid)
        if albums:
            json.dump(albums, open(os.path.join(SCR, "disco", f"{bid}.json"), "w"), ensure_ascii=False)
    emails = re.findall(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", d["notes"] or "")
    b["contact_emails"] = sorted(set(emails)) or b.get("contact_emails")
    if os.path.exists(mp):                     # a game band: refresh lineup/photo/logo, keep its review passage
        m = json.load(open(mp)); m.update(members.parse_band(page))
        json.dump(m, open(mp, "w"), ensure_ascii=False)
    if n % 100 == 0:
        eta = (time.time() - t0) / n * (len(todo) - n)
        print(f"  {n}/{len(todo)} band pages, about {eta / 60:.0f} min left", flush=True)

FIELDS = ["id", "name", "aka", "aka_list", "url", "genre", "country", "location", "status",
          "formed_in", "themes", "label", "notes", "notes_truncated", "contact_emails"]
shutil.copy(DATA, DATA + ".bak")
json.dump([{k: by_id[i].get(k) for k in FIELDS} for i in sorted(by_id)], open(DATA + ".tmp", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
os.replace(DATA + ".tmp", DATA)
for bid, pct in fresh:                         # review count + rating sum, which drive the relevance ranking
    a = RV.setdefault(str(bid), [0, 0])
    a[0] += 1; a[1] += pct
json.dump(RV, open(RV_PATH, "w"))
os.makedirs(NEWDIR, exist_ok=True)             # remember which reviews are counted now
for f, d in rev_pages.items():
    json.dump(d, open(os.path.join(NEWDIR, f), "w"))
print(f"reviews: +{len(fresh)} for {len({b for b, _ in fresh})} bands", flush=True)
print(f"dataset: +{added} new, {updated} updated, -{removed} deleted -> {len(by_id)} bands (previous copy: {DATA}.bak)", flush=True)

# ---------- 3. rebuild ----------
for cwd, cmd in [(HERE, ["regions.py"]), (HERE, ["build.py", os.path.join(HERE, "site")]),
                 (SCR, ["members.py", "6000", "3"]), (SCR, ["verify.py", "6000", "2"]),
                 (HERE, ["game.py"]), (HERE, ["make_netlify.py"])]:
    print("->", " ".join(cmd), flush=True)
    r = subprocess.run([sys.executable] + cmd, cwd=cwd, capture_output=True, text=True,
                       env={**os.environ, "ITUNES_GAP": os.environ.get("ITUNES_GAP", "6")})
    print("\n".join(r.stdout.strip().splitlines()[-3:]), flush=True)
    if r.returncode:
        sys.exit(f"{cmd[0]} failed:\n{r.stderr[-2000:]}")

newest = max(list(new.values()) + list(mod.values()))
json.dump({"since": f"{newest:%Y-%m-%d %H:%M}"}, open(STATE, "w"))
print(f"done. Next run picks up changes after {newest:%Y-%m-%d %H:%M}. Upload map/netlify/", flush=True)
