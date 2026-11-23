import json, re, math, sys
from collections import Counter, defaultdict

SRC = "/Users/miguel/metal_archives_bands.json"
OUT = sys.argv[1] if len(sys.argv) > 1 else None
bands = json.load(open(SRC))

# ---------- countries (denormalized) ----------
KNOWN = {b["country"] for b in bands} - {"International", "Unknown"}
ALIAS = {"US": "United States", "USA": "United States", "U.S.A.": "United States", "UK": "United Kingdom",
         "England": "United Kingdom", "Scotland": "United Kingdom", "Wales": "United Kingdom",
         "Northern Ireland": "United Kingdom", "Turkey": "Türkiye", "South Korea": "Korea, South",
         "Czech Republic": "Czechia", "Holland": "Netherlands", "The Netherlands": "Netherlands"}
PAREN = re.compile(r"\((?:early|mid|later|[^)]*)\)")


def countries_of(b):
    c = b["country"]
    if c != "International":
        return [c]
    found = []
    loc = PAREN.sub("", b.get("location") or "")
    for seg in re.split(r"[/;]", loc):
        parts = [p.strip() for p in seg.split(",") if p.strip()]
        for p in parts[::-1]:
            p = ALIAS.get(p, p)
            if p in KNOWN:
                if p not in found:
                    found.append(p)
                break
    return found or ["International"]


# ---------- genres (atomic) ----------
NOUNS = ("Metal", "Rock", "core", "Grind", "Punk", "Noise", "Ambient", "Drone", "Industrial", "Crust",
         "Folk", "Shoegaze", "Wave", "Electronic", "Neofolk", "Dungeon Synth", "Darkwave", "Jazz", "Blues",
         "Hardcore", "Grindcore", "NWOBHM", "Goregrind", "Pornogrind", "Noisegrind", "Powerviolence", "Fusion",
         "Music", "Synth", "Experimental", "Avant-garde")
CLEAN = re.compile(r"\((?:early|mid|later|[^)]*)\)|\b(?:with|and|influenced|influences|elements|touches)\b.*$", re.I)


def has_noun(s):
    return any(s.endswith(n) or s.lower().endswith(n.lower()) for n in NOUNS)


def genres_of(g):
    out = []
    for era in (g or "").split(";"):
        for chunk in era.split(","):
            chunk = CLEAN.sub("", chunk).strip(" .-")
            if not chunk:
                continue
            parts = [p.strip() for p in chunk.split("/") if p.strip()]
            if not parts:
                continue
            last = parts[-1]
            suffix = last.split()[-1] if has_noun(last) and " " in last else None
            for p in parts:
                if not has_noun(p) and suffix:
                    p = f"{p} {suffix}"
                p = re.sub(r"\s+", " ", p)
                if p and p not in out:
                    out.append(p)
    return out


# ---------- relevance ----------
# score = 0.55 reviews + 0.30 age + 0.10 label + 0.05 notes, each scaled to 0..1:
# 1) Age in Metal Archives: IDs grow with the date a band was added; the bands added first (2002-2005)
#    are mostly the best known ones. Inverted (log) rank of the ID.
# 2) Label: size of the band's current label within the dataset itself (log). No label = 0.
# 3) Documentation: long notes (truncated in the search results) > short notes > no notes.
ids = sorted(b["id"] for b in bands)
rank = {i: n for n, i in enumerate(ids)}
roster = Counter(b["label"] for b in bands if b["label"] and b["label"] != "000INDIE000")
maxr = math.log1p(max(roster.values()))


# 0) Reviews in Metal Archives (the main popularity signal): log of the number of reviews.
import os
RV = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "reviews_by_band.json")))
RV = {int(k): v for k, v in RV.items()}
maxrv = math.log1p(max(v[0] for v in RV.values()))


def score(b):
    rv = math.log1p(RV.get(b["id"], [0])[0]) / maxrv
    age = 1 - math.log1p(rank[b["id"]]) / math.log(len(ids))
    lab = math.log1p(roster.get(b["label"], 0)) / maxr if b["label"] in roster else 0
    notes = 1 if b["notes_truncated"] else (0.5 if b["notes"] else 0)
    return 0.55 * rv + 0.3 * age + 0.1 * lab + 0.05 * notes


for b in bands:
    b["_c"] = countries_of(b)
    b["_g"] = genres_of(b["genre"])
    b["_s"] = score(b)

if OUT is None:
    gc = Counter(g for b in bands for g in b["_g"])
    print(gc.most_common(40))
    for c, g in [("United States", "Thrash Metal"), ("Norway", "Black Metal"), ("Sweden", "Melodic Death Metal"),
                 ("Spain", "Heavy Metal"), ("Germany", "Power Metal"), ("Finland", "Doom Metal")]:
        top = sorted((b for b in bands if c in b["_c"] and g in b["_g"]), key=lambda b: -b["_s"])[:10]
        print(c, g, [b["name"] for b in top])
    intl = [b for b in bands if b["country"] == "International"]
    print("intl resolved", sum(b["_c"] != ["International"] for b in intl), "/", len(intl))
    sys.exit()

# ---------- output v2: index (cube) + per-country band files ----------
import urllib.parse, shutil
STC = {"Active": 1, "On hold": 2, "Split-up": 3, "Unknown": 4, "Changed name": 5, "Disputed": 6}
site = OUT
cdir = os.path.join(site, "c")
shutil.rmtree(cdir, ignore_errors=True); os.makedirs(cdir)

gcount = Counter(g for b in bands for g in b["_g"])
GEN = [g for g, _ in gcount.most_common()]
GI = {g: i for i, g in enumerate(GEN)}
by_c = defaultdict(list)
for b in bands:
    for c in b["_c"]:
        by_c[c].append(b)
CN = sorted(by_c, key=lambda c: -len(by_c[c]))

HERE = os.path.dirname(os.path.abspath(__file__))
RDIR = os.path.join(HERE, "regions_out")
BR = json.load(open(os.path.join(RDIR, "band_regions.json")))
rdir = os.path.join(site, "r")
shutil.rmtree(rdir, ignore_errors=True); os.makedirs(rdir)


def cube_of(bs):
    yrs = defaultdict(lambda: [0, 0])
    cube = defaultdict(lambda: defaultdict(int))
    for b in bs:
        y = b["formed_in"] or 0
        yrs[y][0] += 1
        yrs[y][1] += b["status"] == "Active"
        for g in b["_g"]:
            cube[GI[g]][y] += 1
    return {"y": {str(k): v for k, v in sorted(yrs.items())},
            "g": {str(g): {str(k): v for k, v in sorted(ys.items())} for g, ys in cube.items()}}


index = {"genres": GEN, "countries": []}
# Metal Archives country codes (from metal-archives.com/browse/country), for links to its advanced search
MACC = json.load(open(os.path.join(HERE, "ma_countries.json")))
for ci, c in enumerate(CN):
    bs = sorted(by_c[c], key=lambda b: -b["_s"])
    regs_of = lambda b: BR.get(str(b["id"]), {}).get(c, [])
    gpath = os.path.join(RDIR, "geo", f"{c}.json")
    has_r = os.path.exists(gpath)
    if has_r:
        geo = json.load(open(gpath))
        per = [[] for _ in geo["regions"]]
        for b in bs:
            for r in regs_of(b):
                per[r].append(b)
        geo["cubes"] = [cube_of(x) for x in per]
        geo["unassigned"] = sum(1 for b in bs if not regs_of(b))
        json.dump(geo, open(os.path.join(rdir, f"{ci}.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    yrs = defaultdict(lambda: [0, 0])          # year -> [bands, active]
    cube = defaultdict(lambda: defaultdict(int))  # genre -> year -> count
    for b in bs:
        y = b["formed_in"] or 0
        yrs[y][0] += 1
        yrs[y][1] += b["status"] == "Active"
        for g in b["_g"]:
            cube[GI[g]][y] += 1
    index["countries"].append({"name": c, "file": ci, "r": has_r, "cc": MACC.get(c), "y": {str(k): v for k, v in sorted(yrs.items())},
                               "g": {str(g): {str(k): v for k, v in sorted(ys.items())} for g, ys in cube.items()}})
    labels, li, rows = [], {}, []
    for b in bs:
        l = b["label"]
        if l in (None, "000INDIE000"):
            lx = -1
        else:
            if l not in li:
                li[l] = len(labels); labels.append(l)
            lx = li[l]
        slug = b["url"].split("/bands/")[1].rsplit("/", 1)[0]
        dflt = urllib.parse.quote(b["name"].replace(" ", "_"), safe="")
        rc, rs = RV.get(b["id"], [0, 0])
        rows.append([b["id"], b["name"], 0 if slug == dflt else slug, b["formed_in"] or 0, STC.get(b["status"], 0), lx,
                     b["genre"], [GI[g] for g in b["_g"]], rc, round(rs / rc) if rc else 0, regs_of(b)])
    json.dump({"labels": labels, "rows": rows}, open(os.path.join(cdir, f"{ci}.json"), "w"),
              ensure_ascii=False, separators=(",", ":"))
json.dump(index, open(os.path.join(site, "index.json"), "w"), ensure_ascii=False, separators=(",", ":"))

# ---------- name index (band search and game), sorted by relevance ----------
CIX = {c: i for i, c in enumerate(CN)}
allb = sorted(bands, key=lambda b: -b["_s"])
names, years, active, genres, locs, ids, slugs = [], [], [], [], [], [], {}
for i, b in enumerate(allb):
    names.append(b["name"])
    years.append(b["formed_in"] or 0)
    active.append("1" if b["status"] == "Active" else "0")
    genres.append([GI[g] for g in b["_g"]])
    locs.append([[CIX[c]] + BR.get(str(b["id"]), {}).get(c, []) for c in b["_c"]])
    ids.append(b["id"])
    slug = b["url"].split("/bands/")[1].rsplit("/", 1)[0]
    if slug != urllib.parse.quote(b["name"].replace(" ", "_"), safe=""):
        slugs[i] = slug
json.dump({"n": names, "y": years, "a": "".join(active), "g": genres, "l": locs, "id": ids, "s": slugs},
          open(os.path.join(site, "bands.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print("countries", len(CN), "genres", len(GEN))
