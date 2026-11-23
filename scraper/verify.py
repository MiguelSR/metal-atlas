"""Links each game band to the right iTunes artist, so homonyms (another "Hydra", another "Graveyard") never play.

For each of the N most relevant bands:
  1. Metal Archives discography  -> titles + years   (cache: disco/<id>.json)
  2. iTunes: every artist with exactly the same name -> their albums
  3. The artist whose album titles match the discography wins (self-titled releases also need the year to match).
     Only the matching iTunes albums are kept, so compilations/various-artists releases never play either.
Output: itunes/<id>.json = {"a": artistId|null, "c": [collectionId, ...], "n": matched titles}
Usage: python3 verify.py [N=6000] [ma_workers=2]
"""
import json, os, re, subprocess, sys, time, html, unicodedata, urllib.parse
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
DISCO, ITU = os.path.join(HERE, "disco"), os.path.join(HERE, "itunes")
os.makedirs(DISCO, exist_ok=True); os.makedirs(ITU, exist_ok=True)
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 6000
W = int(sys.argv[2]) if len(sys.argv) > 2 else 2

BI = json.load(open(os.path.join(HERE, "..", "map", "site", "bands.json")))
ids = BI["id"][:N]
NAME = dict(zip(BI["id"], BI["n"]))
ROW = re.compile(r'<td><a href="[^"]*/albums/[^"]*/(\d+)" class="[^"]*">(.*?)</a></td>\s*<td class="[^"]*">(.*?)</td>\s*<td class="[^"]*">(\d{4})</td>', re.S)
NOISE = re.compile(r"\((?:[^)]*)\)|\[(?:[^\]]*)\]|\s-\s(?:ep|single|deluxe.*|remaster.*|re-?issue.*|bonus.*|expanded.*|live)$", re.I)


def fold(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c)).lower()


def tnorm(s):
    s = NOISE.sub("", fold(html.unescape(s or "")))
    s = re.sub(r"\b(remaster(ed)?|deluxe|edition|version|reissue|anniversary)\b", "", s)
    return re.sub(r"[\W_]+", "", s)


def curl(url, ma=True):
    for attempt in range(5):
        r = subprocess.run(["curl", "-s", "-w", "\n%{http_code}", "-A", UA, url], capture_output=True, text=True)
        body, _, code = r.stdout.rpartition("\n")
        if code == "200":
            if ma:
                time.sleep(0.8)
            return body
        if code == "404":
            return None
        time.sleep(5 * (attempt + 1))
    print("failed", url, code, flush=True)
    return None


def disco(bid):
    p = os.path.join(DISCO, f"{bid}.json")
    if os.path.exists(p):
        return json.load(open(p))
    page = curl(f"https://www.metal-archives.com/band/discography/id/{bid}/tab/all")
    rows = [[int(a), html.unescape(t).strip(), ty.strip(), int(y)] for a, t, ty, y in ROW.findall(page or "")]
    json.dump(rows, open(p, "w"), ensure_ascii=False)
    return rows


import threading
_ilock = threading.Lock()
_last = [0.0]
GAP = float(os.environ.get("ITUNES_GAP", "3.2"))   # iTunes allows roughly 20 calls/min per IP: stay under it


def itunes(q):
    """iTunes Search API, paced and one call at a time; on 403 (rate limit) waits and retries. Raises if it never answers."""
    with _ilock:
        for attempt in range(10):
            wait = _last[0] + GAP - time.time()
            if wait > 0:
                time.sleep(wait)
            r = subprocess.run(["curl", "-s", "-w", "\n%{http_code}", "https://itunes.apple.com/" + q], capture_output=True, text=True)
            _last[0] = time.time()
            body, _, code = r.stdout.rpartition("\n")
            if code == "200":
                return json.loads(body)["results"]
            # blocked: back off for a long while instead of poking it every few minutes (that seems to extend the block)
            pause = min(900 * (attempt + 1), 1800)
            print(f"{time.strftime('%H:%M')} itunes {code}, pausing {pause // 60} min", flush=True)
            time.sleep(pause)
    raise RuntimeError("itunes unavailable")


def verify(bid):
    out = os.path.join(ITU, f"{bid}.json")
    if os.path.exists(out) and json.load(open(out)).get("v") == 3:
        return None
    name = NAME[bid]
    d = disco(bid)
    ma = {}
    for _, t, ty, y in d:
        ma.setdefault(tnorm(t), []).append(y)
    self_t = tnorm(name)
    arts = [a for a in itunes("search?entity=musicArtist&limit=200&term=" + urllib.parse.quote(name))
            if fold(a["artistName"]) == fold(name)]
    # many artists share a name ("Hydra" has 40+ on iTunes): try metal/rock-ish ones first
    g = lambda a: 0 if re.search(r"metal", a.get("primaryGenreName") or "", re.I) else \
        1 if re.search(r"rock|punk|grind|core|industrial|alternative|goth|doom", a.get("primaryGenreName") or "", re.I) else 2
    arts.sort(key=g)
    cands = arts[:12]
    songs = {a["artistId"]: [] for a in cands}
    if cands:   # one lookup for all candidates; songs carry their album (collection) name, id and date
        for x in itunes("lookup?entity=song&limit=200&id=" + ",".join(str(a["artistId"]) for a in cands)):
            if x.get("wrapperType") == "track" and x.get("artistId") in songs:
                songs[x["artistId"]].append(x)
    best = (0, None, [], [], [])
    for a in cands:
        hits, cols, tracks, seen = set(), [], [], set()
        for x in songs[a["artistId"]]:
            k = tnorm(x.get("collectionName"))
            if not k or k not in ma:
                continue
            y = int((x.get("releaseDate") or "0")[:4] or 0)
            if k == self_t and not any(abs(y - my) <= 1 for my in ma[k]):
                continue   # a self-titled album only counts if the year matches too
            hits.add(k)
            if x["collectionId"] not in cols:
                cols.append(x["collectionId"])
            tk = fold(x.get("trackName") or "")
            if x.get("previewUrl") and tk not in seen and len(tracks) < 12:
                seen.add(tk)
                tracks.append([x["previewUrl"], x.get("trackName"), x.get("collectionName"), x.get("artworkUrl100")])
        if len(hits) > best[0] and tracks:
            best = (len(hits), a["artistId"], cols, sorted(hits), tracks)
    res = {"a": best[1], "c": best[2], "n": best[3], "t": best[4], "v": 3}
    json.dump(res, open(out, "w"), ensure_ascii=False)
    return res


def safe(bid):
    try:
        return verify(bid)
    except Exception as e:
        print("skip", bid, e, flush=True)
        return None


if __name__ == "__main__":
    t0 = time.time(); ok = 0
    with ThreadPoolExecutor(W) as ex:
        for n, r in enumerate(ex.map(safe, ids), 1):
            ok += bool(r and r["a"])
            if n % 100 == 0:
                print(f"{n}/{len(ids)} verified-now={ok} {time.time() - t0:.0f}s", flush=True)
    print("done")
