"""Asigna cada banda a regiones (admin-1) dentro de su país y genera la geometría regional.

Entrada:  ~/metal_archives_bands.json, geo_dl/admin1.geojson (Natural Earth 10m), geo_dl/cities1000.txt + admin1Codes.txt (GeoNames)
Salida:   regions_out/band_regions.json   {band_id: {país: [idx región, ...]}}
          regions_out/geo/<país>.json      {"regions": [nombre...], "fills": FeatureCollection, "borders": MultiLineString}
"""
import json, os, re, unicodedata, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DL = os.path.join(HERE, "geo_dl")
OUT = os.path.join(HERE, "regions_out")
os.makedirs(os.path.join(OUT, "geo"), exist_ok=True)
Q = 100  # cuantización: 0,01°

# países demasiado troceados en Natural Earth -> se agrupan por su campo "region"
GROUP = {"United Kingdom", "Slovenia", "Latvia", "Italy", "France", "Spain", "Philippines"}
NE_TO_MA = {"United States of America": "United States", "Czech Republic": "Czechia", "Republic of Serbia": "Serbia",
            "South Korea": "Korea, South", "Turkey": "Türkiye", "Macedonia": "North Macedonia", "East Timor": "East Timor",
            "Faroe Islands": "Faroe Islands", "Aland": "Åland Islands", "The Bahamas": "Bahamas"}


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(oblast|province|provincia|region|regione|county|state|prefecture|voivodeship|kraj|krai|"
               r"republic|of|the|district|department|departement|fylke|lan|län|governorate|municipality)\b", " ", s)
    return re.sub(r"[^a-z0-9]+", "", s)


bands = json.load(open(os.path.expanduser("~/metal_archives_bands.json")))
MA = {b["country"] for b in bands}

# ---------- Natural Earth ----------
feats = json.load(open(os.path.join(DL, "admin1.geojson")))["features"]
units = defaultdict(list)  # país MA -> [props, polys]
iso = {}
for f in feats:
    p = f["properties"]
    c = NE_TO_MA.get(p["admin"], p["admin"])
    if c not in MA or f["geometry"] is None:
        continue
    iso[c] = p["iso_a2"] if p["iso_a2"] not in (None, "-1", "-99") else iso.get(c)
    g = f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    qp = []
    for poly in polys:
        rings = []
        for ring in poly:
            r = []
            for x, y in ring:
                pt = (round(x * Q), round(y * Q))
                if not r or r[-1] != pt:
                    r.append(pt)
            if len(r) >= 4:
                rings.append(r)
        if rings:
            qp.append(rings)
    if qp:
        units[c].append((p, qp))


def pip(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]; xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi:
            inside = not inside
        j = i
    return inside


COUNTRY = {}  # país -> dict(regions, rnames index, units[(ridx, polys, bbox)])
for c, us in units.items():
    grouped = c in GROUP
    regions, ridx, names = [], {}, defaultdict(set)
    ulist = []
    en_count = defaultdict(int)
    for p, _ in us:
        en_count[p.get("name_en")] += 1
    taken = {p["name"] for p, _ in us}
    for p, polys in us:
        if not (p.get("name") or p.get("name_en") or p.get("woe_name")):
            continue
        if c == "Mexico" and p.get("name") == "Distrito Federal":
            p = {**p, "name_en": "Ciudad de México", "name_alt": "Mexico City|CDMX|Distrito Federal"}
        en = p.get("name_en")
        # nombre en inglés salvo que falte, se repita o choque con otro nombre local (p. ej. DF de México = "Mexico")
        if not en or en_count[en] > 1 or (en in taken and en != p["name"]):
            en = p["name"] or p.get("woe_name") or p.get("gn_name") or "?"
        key = (p.get("region") or p["name"]) if grouped else en
        if key not in ridx:
            ridx[key] = len(regions); regions.append(key)
        r = ridx[key]
        for n in [p.get("name"), p.get("name_en"), p.get("woe_name"), p.get("gn_name"), p.get("name_local"), key] + \
                 (p.get("name_alt") or "").split("|"):
            if n and norm(n):
                names[norm(n)].add(r)
        xs = [pt[0] for poly in polys for pt in poly[0]]; ys = [pt[1] for poly in polys for pt in poly[0]]
        ulist.append((r, polys, (min(xs), min(ys), max(xs), max(ys))))
    COUNTRY[c] = {"regions": regions, "names": names, "units": ulist}


def locate(c, lon, lat):
    x, y = lon * Q, lat * Q
    best = None
    for r, polys, (x0, y0, x1, y1) in COUNTRY[c]["units"]:
        if x0 <= x <= x1 and y0 <= y <= y1:
            for poly in polys:
                if pip(x, y, poly[0]) and not any(pip(x, y, h) for h in poly[1:]):
                    return r
            best = r if best is None else best
    if best is not None:
        return best
    # fuera de todo polígono (costa, cuantización): unidad con el centro de bbox más cercano
    d = lambda u: ((u[2][0] + u[2][2]) / 2 - x) ** 2 + ((u[2][1] + u[2][3]) / 2 - y) ** 2
    return min(COUNTRY[c]["units"], key=d)[0]


# ---------- GeoNames ----------
a1name = {}
for line in open(os.path.join(DL, "admin1Codes.txt"), encoding="utf-8"):
    code, name, ascii_, _ = line.rstrip("\n").split("\t")
    a1name[code] = {norm(name), norm(ascii_)}
cities = defaultdict(lambda: defaultdict(list))  # iso2 -> nombre norm -> [(pop, lat, lon, admin1)]
want = {v for v in iso.values() if v}
for line in open(os.path.join(DL, "cities1000.txt"), encoding="utf-8"):
    t = line.split("\t")
    cc = t[8]
    if cc not in want:
        continue
    rec = (int(t[14] or 0), float(t[4]), float(t[5]), f"{cc}.{t[10]}")
    ns = {norm(t[1]), norm(t[2])} | {norm(a) for a in t[3].split(",") if a and len(a) < 40}
    for n in ns:
        if n:
            cities[cc][n].append(rec)

PAREN = re.compile(r"\([^)]*\)")
KNOWN = MA - {"International", "Unknown"}
ALIAS = {"US": "United States", "USA": "United States", "UK": "United Kingdom", "England": "United Kingdom",
         "Scotland": "United Kingdom", "Wales": "United Kingdom", "Northern Ireland": "United Kingdom", "Turkey": "Türkiye"}


def regions_for(c, parts):
    """parts: trozos de un segmento de ubicación, sin el país."""
    C = COUNTRY[c]
    cc = iso.get(c)
    hints = [norm(p) for p in parts]
    # 1) nombre de región explícito (de último a primero: "Ciudad, Región")
    for h in hints[::-1]:
        if h in C["names"] and len(C["names"][h]) == 1:
            return next(iter(C["names"][h]))
    # 2) ciudad (primer trozo que sea ciudad), desempatando por región mencionada
    for i, h in enumerate(hints):
        cand = cities[cc].get(h) if cc else None
        if cand:
            rest = set(hints[i + 1:])
            pick = [r for r in cand if a1name.get(r[3], set()) & rest] or cand
            pop, lat, lon, _ = max(pick)
            return locate(c, lon, lat)
    # 2) nombre de región directamente
    for h in hints[::-1]:
        if h in C["names"] and len(C["names"][h]) == 1:
            return next(iter(C["names"][h]))
    return None


band_regions = {}
stats = defaultdict(lambda: [0, 0])
for b in bands:
    loc = PAREN.sub("", b.get("location") or "")
    if not loc or loc.strip() in ("N/A", "Unknown"):
        continue
    out = defaultdict(list)
    for seg in re.split(r"[/;]", loc):
        parts = [p.strip() for p in seg.split(",") if p.strip()]
        if not parts:
            continue
        if b["country"] == "International":
            last = ALIAS.get(parts[-1], parts[-1])
            if last not in KNOWN:
                continue
            c, parts = last, parts[:-1]
        else:
            c = b["country"]
            if ALIAS.get(parts[-1], parts[-1]) == c:
                parts = parts[:-1]
        if c not in COUNTRY or not parts:
            continue
        r = regions_for(c, parts)
        if r is not None and r not in out[c]:
            out[c].append(r)
    for c in ([b["country"]] if b["country"] in COUNTRY else []):
        stats[c][1] += 1
        stats[c][0] += bool(out.get(c))
    if out:
        band_regions[b["id"]] = dict(out)

json.dump(band_regions, open(os.path.join(OUT, "band_regions.json"), "w"), ensure_ascii=False, separators=(",", ":"))


# ---------- geometría de salida ----------
def ring_out(r, exterior=True):
    # d3-geo espera anillos exteriores en sentido horario (área de Gauss negativa) y huecos en antihorario
    a = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(r, r[1:] + r[:1]))
    if (a > 0) == exterior:
        r = r[::-1]
    return [[x / Q, y / Q] for x, y in r]


for c, C in COUNTRY.items():
    fills = []
    seg_regions = defaultdict(set)
    seg_count = defaultdict(int)
    for r, polys, _ in C["units"]:
        fills.append({"type": "Feature", "properties": {"r": r},
                      "geometry": {"type": "MultiPolygon", "coordinates": [[ring_out(x, i == 0) for i, x in enumerate(poly)] for poly in polys]}})
        for poly in polys:
            for ring in poly:
                for a, b2 in zip(ring, ring[1:]):
                    k = (a, b2) if a < b2 else (b2, a)
                    seg_regions[k].add(r); seg_count[k] += 1
    # fronteras entre regiones distintas (las internas de una región agrupada desaparecen)
    lines = [[[a[0] / Q, a[1] / Q], [b2[0] / Q, b2[1] / Q]] for (a, b2), rs in seg_regions.items()
             if len(rs) > 1]
    # unir segmentos consecutivos para aligerar
    merged = []
    for s in lines:
        if merged and merged[-1][-1] == s[0]:
            merged[-1].append(s[1])
        else:
            merged.append(list(s))
    json.dump({"regions": C["regions"], "fills": {"type": "FeatureCollection", "features": fills},
               "borders": {"type": "MultiLineString", "coordinates": merged}},
              open(os.path.join(OUT, "geo", f"{c}.json"), "w"), ensure_ascii=False, separators=(",", ":"))

tot = [sum(v[0] for v in stats.values()), sum(v[1] for v in stats.values())]
print("bandas con región:", tot[0], "/", tot[1], f"({tot[0] / tot[1]:.0%})")
for c in ["United States", "Germany", "Brazil", "Italy", "United Kingdom", "France", "Canada", "Russia", "Spain", "Sweden",
          "Poland", "Finland", "Norway", "Mexico", "Japan", "Czechia"]:
    if c in stats:
        print(f"  {c:16} {stats[c][0] / stats[c][1]:.0%}  regiones={len(COUNTRY[c]['regions'])}")
print("países sin geometría regional:", sorted(KNOWN - set(COUNTRY)))
