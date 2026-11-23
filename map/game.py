"""Builds site/game.json for the guessing game.

Pool = the most relevant bands (site/bands.json is already sorted by relevance) that have
  - a lineup, photo/logo and review passage  (scraper/members/<id>.json, from scraper/members.py)
  - a verified iTunes artist whose albums match their Metal Archives discography (scraper/itunes/<id>.json, from scraper/verify.py)
  - a formation year.
Difficulty levels are slices of the relevance ranking.

Row: [id, name, slug|0, year, countries, members, lineupHeader, photo, review, reviewPct, logo, itunesArtist, [albums],
      [[previewUrl, track, album, artwork], ...],   <- up to 5 verified previews: the browser never calls the iTunes API
                                                       (URLs shortened: see pick(); index.html gameTracks() expands them)
      location]                                      <- city/area, e.g. "Gothenburg, Västra Götaland" (or null)
Usage: python3 game.py [--mixed]   (after build.py)
  default: only bands whose songs were verified and stored (the page never calls the iTunes API)
  --mixed: also bands without verified songs; the page then searches iTunes live for them (may hit a namesake band)
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, "site")
SCR = os.path.join(HERE, "..", "scraper")
LEVELS = [(0, 250), (250, 800), (800, 2000), (2000, 3800), (3800, 6000)]  # relevance-rank slices
ALB_TYPES = ("Full-length", "EP")
VERIFIED_ONLY = "--mixed" not in sys.argv

BI = json.load(open(os.path.join(SITE, "bands.json")))
IDX = json.load(open(os.path.join(SITE, "index.json")))
CN = [c["name"] for c in IDX["countries"]]
# city / area (Metal Archives "Location"), for the origin clue: the country alone is often too obvious
LOC = {b["id"]: b.get("location") for b in json.load(open(os.path.expanduser("~/metal_archives_bands.json")))}


TRACKS = 5   # per band, enough for variety across replays (12 made game.json ~21 MB)
AUDIO = "https://audio-ssl.itunes.apple.com/itunes-assets/"
ART = re.compile(r"^https://is(\d)-ssl\.mzstatic\.com/image/thumb/(.+)/100x100bb\.jpg$")


def pick(tracks):
    """Up to TRACKS songs, round-robin across albums, with the common URL parts stripped (the page adds them back)."""
    by_album = {}
    for t in tracks:
        by_album.setdefault(t[2], []).append(t)
    out, queues = [], list(by_album.values())
    while len(out) < TRACKS and any(queues):
        for q in queues:
            if q and len(out) < TRACKS:
                out.append(q.pop(0))
    short = []
    for url, title, album, art in out:
        m = ART.match(art or "")
        short.append([url[len(AUDIO):] if url.startswith(AUDIO) else url, title, album,
                      f"{m.group(1)}|{m.group(2)}" if m else art])
    return short


def load(sub, bid):
    p = os.path.join(SCR, sub, f"{bid}.json")
    return json.load(open(p)) if os.path.exists(p) else None


levels, rows, pending, unverified = [], [], 0, 0
for a, b in LEVELS:
    lv = []
    for i in range(a, min(b, len(BI["id"]))):
        bid = BI["id"][i]
        m, it, dc = load("members", bid), load("itunes", bid), load("disco", bid)
        if m is None:
            pending += 1
            continue
        tracks = pick((it or {}).get("t") or [])   # verified previews (the page searches iTunes live only with --mixed)
        unverified += not tracks
        if VERIFIED_ONLY and not tracks:
            continue
        if not m["m"] or not BI["y"][i]:
            continue
        albums = [t for _, t, ty, _ in (dc or []) if ty in ALB_TYPES] or [t for _, t, ty, _ in (dc or []) if ty != "Demo"]
        lv.append(len(rows))
        rows.append([bid, BI["n"][i], BI["s"].get(str(i), 0), BI["y"][i],
                     " / ".join(CN[l[0]] for l in BI["l"][i]), m["m"][:6], m["h"] or "",
                     m.get("p"), m.get("r"), m.get("rs"), m.get("lg"), (it or {}).get("a"), albums[:30], tracks, LOC.get(bid)])
    levels.append(lv)

json.dump({"levels": levels, "b": rows}, open(os.path.join(SITE, "game.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print("levels:", [len(l) for l in levels], "| not downloaded yet:", pending, "| without verified songs:", unverified, "(excluded)" if VERIFIED_ONLY else "(searched live)")
