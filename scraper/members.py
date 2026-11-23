"""Downloads extra data for the N most relevant bands (for the guessing game).

Reads map/site/bands.json (already sorted by relevance). Per band:
  - band page   -> lineup (current / last known) + photo URL
  - one review  -> a short passage that does not mention the band (or the album) by name
Cache: scraper/members/<id>.json = {"h": header, "m": [[name, role], ...], "p": photo|null, "lg": logo|null, "r": snippet|null, "ra": album, "rs": pct}
Resumable. Usage: python3 members.py [N=6000] [workers=3]
"""
import json, os, re, subprocess, sys, time, html, unicodedata, glob
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "members")
os.makedirs(OUT, exist_ok=True)
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 6000
W = int(sys.argv[2]) if len(sys.argv) > 2 else 3
DELAY = 0.8

BI = json.load(open(os.path.join(HERE, "..", "map", "site", "bands.json")))
ids = BI["id"][:N]
NAME = dict(zip(BI["id"], BI["n"]))

# ---------- review index from the cached review list pages: band id -> [(pct, url, album)] ----------
REV = defaultdict(list)
for f in glob.glob(os.path.join(HERE, "..", "map", "reviews_pages", "*.json")):
    for row in json.load(open(f)).get("aaData", []):
        u = re.search(r'href="([^"]+/reviews/[^"]+)"', row[1])
        b = re.search(r'/bands/[^"]*/(\d+)"', row[2])
        a = re.search(r">(.*?)</a>", row[3])
        if u and b:
            REV[int(b.group(1))].append((int(row[4].rstrip("%") or 0), u.group(1), html.unescape(a.group(1)) if a else ""))

ROW = re.compile(r'<tr class="lineupHeaders">\s*<td[^>]*>(.*?)</td>|<a href="[^"]*/artists/[^"]*" class="bold">(.*?)</a>.*?</td>\s*<td>(.*?)</td>', re.S)


def fold(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c)).lower()


def parse_band(page):
    photo = re.search(r'id="photo"[^>]*href="([^"]+)"', page)
    logo = re.search(r'id="logo"[^>]*href="([^"]+)"', page)
    out = {"h": None, "m": [], "p": html.unescape(photo.group(1)) if photo else None,
           "lg": html.unescape(logo.group(1)) if logo else None}
    i = page.find('id="band_tab_members_all"')
    if i < 0:
        i = page.find('id="band_tab_members_current"')
    if i < 0:
        return out
    j = page.find('id="band_tab_members_live"', i)
    sec = page[i: j if j > 0 else i + 200000]
    groups, cur = [], None
    for h, name, role in ROW.findall(sec):
        if h:
            cur = [re.sub(r"\s+", " ", html.unescape(re.sub("<[^>]+>", "", h))).strip(), []]
            groups.append(cur)
        elif name:
            if cur is None:
                cur = ["", []]; groups.append(cur)
            role = html.unescape(re.sub("<[^>]+>", "", role)).replace("\xa0", " ")
            role = re.sub(r"\s*\([^)]*\)", "", re.sub(r"\s+", " ", role)).strip()
            cur[1].append([html.unescape(name).strip(), role])
    if groups:
        pick = next((g for g in groups if re.match(r"(Current|Last known)", g[0], re.I)), groups[0])
        out["h"], out["m"] = pick[0], pick[1]
    return out


def snippet(page, band, album):
    m = re.search(r'<div class="reviewContent">(.*?)</div>', page, re.S)
    if not m or len(band) < 3:
        return None
    txt = html.unescape(re.sub(r"<br\s*/?>", "\n", m.group(1)))
    txt = re.sub(r"<[^>]+>", "", txt)
    paras = [re.sub(r"\s+", " ", p).strip() for p in txt.split("\n") if len(p.strip()) > 60]
    bad = [re.compile(r"(?<![a-z0-9])" + re.escape(fold(x)) + r"(?![a-z0-9])") for x in (band, album) if x and len(x) >= 3]
    bad.append(re.compile(re.escape(fold(band).replace(" ", ""))))
    clean = lambda s: not any(b.search(fold(s)) for b in bad)
    order = paras[1:-1] + paras[:1] + paras[-1:] if len(paras) > 2 else paras
    for p in order:
        sents = re.split(r"(?<=[.!?])\s+(?=[A-Z\"“'(])", p)
        for a in range(len(sents)):
            s = ""
            for z in range(a, len(sents)):
                s = (s + " " + sents[z]).strip()
                if len(s) > 320 or not clean(sents[z]):
                    break
                if len(s) >= 140 and clean(s):
                    return s
    return None


def curl(url):
    for attempt in range(5):
        r = subprocess.run(["curl", "-s", "-w", "\n%{http_code}", "-A", UA, url], capture_output=True, text=True)
        body, _, code = r.stdout.rpartition("\n")
        if code == "200":
            time.sleep(DELAY)
            return body
        if code == "404":
            return None
        time.sleep(5 * (attempt + 1))
    print("failed", url, code, flush=True)
    return None


def get(bid):
    path = os.path.join(OUT, f"{bid}.json")
    old = json.load(open(path)) if os.path.exists(path) else None
    if old and "lg" in old:
        return 0
    page = curl(f"https://www.metal-archives.com/bands/_/{bid}")
    if page is None:
        return 0
    d = parse_band(page)
    if old and "p" in old:   # already has its review: only the logo was missing
        old.update(d); json.dump(old, open(path, "w"), ensure_ascii=False)
        return 1
    d.update(r=None, ra=None, rs=None)
    revs = sorted(REV.get(bid, []), reverse=True)  # highest-rated review first (they tend to describe the sound)
    for pct, url, album in revs[:2]:
        rp = curl(url)
        sn = rp and snippet(rp, NAME[bid], album)
        if sn:
            d.update(r=sn, ra=album, rs=pct)
            break
    json.dump(d, open(path, "w"), ensure_ascii=False)
    return 1


if __name__ == "__main__":
    t0 = time.time(); done = 0
    with ThreadPoolExecutor(W) as ex:
        for n, k in enumerate(ex.map(get, ids), 1):
            done += k
            if n % 100 == 0:
                print(f"{n}/{len(ids)} fetched={done} {time.time() - t0:.0f}s", flush=True)
    print("done", len(os.listdir(OUT)), "files")
