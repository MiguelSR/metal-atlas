"""Places each band in the regions (states, provinces…) of its country, and writes the regions' geometry.

A location like "Gothenburg, Västra Götaland" is matched against region names (Natural Earth admin-1) and against
city names (GeoNames, places with 1,000+ people), whose coordinates are then placed inside a region polygon.

Input:   the master dataset; geo_dl/admin1.geojson (Natural Earth 10m), geo_dl/cities1000.txt and admin1Codes.txt
Output:  regions_out/band_regions.json   {band id: {country: [region index, …]}}
         regions_out/geo/<country>.json   {"regions": [name, …], "fills": FeatureCollection, "borders": MultiLineString}

Usage: python3 -m metal_atlas regions
"""

import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field

from . import paths
from .countries import INTERNATIONAL, UNKNOWN, canonical_country, location_segments, without_eras
from .jsonio import read_json, write_json

SCALE = 100  # coordinates are quantized to 0.01°

# countries split into too many small units in Natural Earth: grouped by their "region" field
GROUPED = {"United Kingdom", "Slovenia", "Latvia", "Italy", "France", "Spain", "Philippines"}
NATURAL_EARTH_NAMES = {
    "United States of America": "United States",
    "Czech Republic": "Czechia",
    "Republic of Serbia": "Serbia",
    "South Korea": "Korea, South",
    "Turkey": "Türkiye",
    "Macedonia": "North Macedonia",
    "Aland": "Åland Islands",
    "The Bahamas": "Bahamas",
}
_GENERIC_WORDS = re.compile(
    r"\b(oblast|province|provincia|region|regione|county|state|prefecture|voivodeship|kraj|krai|"
    r"republic|of|the|district|department|departement|fylke|lan|län|governorate|municipality)\b"
)

Point = tuple[int, int]
Ring = list[Point]
Polygon = list[Ring]  # exterior ring first, then holes


def name_key(name: str | None) -> str:
    """A comparable form of a place name: ASCII, lowercase, without generic words ("Province of …") or spaces."""
    ascii_name = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "", _GENERIC_WORDS.sub(" ", ascii_name))


# ---------- geometry ----------


def quantize(geometry: dict) -> list[Polygon]:
    """GeoJSON (Multi)Polygon -> polygons of integer points, without repeated points or degenerate rings."""
    polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    out = []
    for polygon in polygons:
        rings = []
        for ring in polygon:
            points: Ring = []
            for x, y in ring:
                point = (round(x * SCALE), round(y * SCALE))
                if not points or points[-1] != point:
                    points.append(point)
            if len(points) >= 4:
                rings.append(points)
        if rings:
            out.append(rings)
    return out


def point_in_ring(x: float, y: float, ring: Ring) -> bool:
    """Ray casting."""
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def oriented(ring: Ring, exterior: bool) -> list[list[float]]:
    """Ring in degrees, oriented as d3-geo expects: exterior rings clockwise, holes counter-clockwise."""
    area = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]))
    if (area > 0) == exterior:
        ring = ring[::-1]
    return [[x / SCALE, y / SCALE] for x, y in ring]


# ---------- regions of one country ----------


@dataclass
class Unit:
    region: int
    polygons: list[Polygon]
    bbox: tuple[int, int, int, int]

    def contains(self, x: float, y: float) -> bool:
        return any(
            point_in_ring(x, y, polygon[0]) and not any(point_in_ring(x, y, hole) for hole in polygon[1:])
            for polygon in self.polygons
        )

    def bbox_has(self, x: float, y: float) -> bool:
        x0, y0, x1, y1 = self.bbox
        return x0 <= x <= x1 and y0 <= y <= y1

    def distance2(self, x: float, y: float) -> float:
        x0, y0, x1, y1 = self.bbox
        return ((x0 + x1) / 2 - x) ** 2 + ((y0 + y1) / 2 - y) ** 2


@dataclass
class CountryRegions:
    regions: list[str] = field(default_factory=list)
    names: dict[str, set[int]] = field(default_factory=lambda: defaultdict(set))  # name key -> region indices
    units: list[Unit] = field(default_factory=list)
    iso: str | None = None

    def region_named(self, key: str) -> int | None:
        """The region with this name, if the name is unambiguous."""
        matches = self.names.get(key)
        return next(iter(matches)) if matches and len(matches) == 1 else None

    def locate(self, lon: float, lat: float) -> int:
        """The region containing a point; off every polygon (coastline, quantization), the closest one."""
        x, y = lon * SCALE, lat * SCALE
        first_bbox_hit = None
        for unit in self.units:
            if unit.bbox_has(x, y):
                if unit.contains(x, y):
                    return unit.region
                first_bbox_hit = unit.region if first_bbox_hit is None else first_bbox_hit
        if first_bbox_hit is not None:
            return first_bbox_hit
        return min(self.units, key=lambda u: u.distance2(x, y)).region


def _display_name(props: dict, english_count: dict, local_names: set) -> str:
    """English name, unless it is missing, repeated or clashes with another local name (e.g. Mexico City's "Mexico")."""
    english = props.get("name_en")
    if not english or english_count[english] > 1 or (english in local_names and english != props["name"]):
        english = props["name"] or props.get("woe_name") or props.get("gn_name") or "?"
    return english


def country_regions(features: list[dict], known_countries: set[str]) -> dict[str, CountryRegions]:
    """Natural Earth admin-1 features -> regions of every country in the dataset."""
    units_of: dict[str, list[tuple[dict, list[Polygon]]]] = defaultdict(list)
    iso: dict[str, str | None] = {}
    for feature in features:
        props = feature["properties"]
        country = NATURAL_EARTH_NAMES.get(props["admin"], props["admin"])
        if country not in known_countries or feature["geometry"] is None:
            continue
        iso[country] = props["iso_a2"] if props["iso_a2"] not in (None, "-1", "-99") else iso.get(country)
        polygons = quantize(feature["geometry"])
        if polygons:
            units_of[country].append((props, polygons))

    out = {}
    for country, units in units_of.items():
        cr = CountryRegions(iso=iso.get(country))
        english_count: dict[str, int] = defaultdict(int)
        for props, _ in units:
            english_count[props.get("name_en")] += 1
        local_names = {props["name"] for props, _ in units}
        region_index: dict[str, int] = {}
        for props, polygons in units:
            if not (props.get("name") or props.get("name_en") or props.get("woe_name")):
                continue
            if country == "Mexico" and props.get("name") == "Distrito Federal":
                props = {**props, "name_en": "Ciudad de México", "name_alt": "Mexico City|CDMX|Distrito Federal"}
            display = _display_name(props, english_count, local_names)
            key = (props.get("region") or props["name"]) if country in GROUPED else display
            if key not in region_index:
                region_index[key] = len(cr.regions)
                cr.regions.append(key)
            r = region_index[key]
            aliases = [props.get(k) for k in ("name", "name_en", "woe_name", "gn_name", "name_local")]
            for alias in [*aliases, key, *(props.get("name_alt") or "").split("|")]:
                if alias and name_key(alias):
                    cr.names[name_key(alias)].add(r)
            xs = [p[0] for polygon in polygons for p in polygon[0]]
            ys = [p[1] for polygon in polygons for p in polygon[0]]
            cr.units.append(Unit(r, polygons, (min(xs), min(ys), max(xs), max(ys))))
        out[country] = cr
    return out


# ---------- cities ----------


@dataclass
class City:
    population: int
    lat: float
    lon: float
    admin1: str  # "<country code>.<admin1 code>"


class Gazetteer:
    """GeoNames cities by country code and name key, and admin-1 names by code."""

    def __init__(self, cities_file, admin1_file, country_codes: set[str]):
        self.admin1_names: dict[str, set[str]] = {}
        with open(admin1_file, encoding="utf-8") as f:
            for line in f:
                code, name, ascii_name, _ = line.rstrip("\n").split("\t")
                self.admin1_names[code] = {name_key(name), name_key(ascii_name)}
        self.cities: dict[str, dict[str, list[City]]] = defaultdict(lambda: defaultdict(list))
        with open(cities_file, encoding="utf-8") as f:
            for line in f:
                cols = line.split("\t")
                cc = cols[8]
                if cc not in country_codes:
                    continue
                city = City(int(cols[14] or 0), float(cols[4]), float(cols[5]), f"{cc}.{cols[10]}")
                names = {name_key(cols[1]), name_key(cols[2])}
                names |= {name_key(a) for a in cols[3].split(",") if a and len(a) < 40}
                for name in names - {""}:
                    self.cities[cc][name].append(city)

    def biggest(self, country_code: str | None, key: str, hints: set[str]) -> City | None:
        """The most populated city with this name, preferring one in a region named among ``hints``."""
        candidates = self.cities[country_code].get(key) if country_code else None
        if not candidates:
            return None
        in_hinted = [c for c in candidates if self.admin1_names.get(c.admin1, set()) & hints]
        return max(in_hinted or candidates, key=lambda c: (c.population, c.lat, c.lon, c.admin1))


def region_for(regions: CountryRegions, gazetteer: Gazetteer, parts: list[str]) -> int | None:
    """The region of one location ("City, Region" pieces, without the country)."""
    keys = [name_key(p) for p in parts]
    for key in reversed(keys):  # 1) an explicit region name, last to first
        region = regions.region_named(key)
        if region is not None:
            return region
    for i, key in enumerate(keys):  # 2) the first piece that is a city (tie-break: a region named after it)
        city = gazetteer.biggest(regions.iso, key, set(keys[i + 1 :]))
        if city:
            return regions.locate(city.lon, city.lat)
    return None


def band_region_map(bands: list[dict], regions: dict[str, CountryRegions], gazetteer: Gazetteer, known: set[str]):
    """{band id: {country: [region indices]}} and per-country stats [bands placed, bands]."""
    placed: dict[int, dict[str, list[int]]] = {}
    stats: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for band in bands:
        location = band.get("location")
        if without_eras(location).strip() in ("", "N/A", UNKNOWN):
            continue
        out: dict[str, list[int]] = defaultdict(list)
        for parts in location_segments(location):
            if band["country"] == INTERNATIONAL:
                country = canonical_country(parts[-1])
                if country not in known:
                    continue
                parts = parts[:-1]
            else:
                country = band["country"]
                if canonical_country(parts[-1]) == country:
                    parts = parts[:-1]
            if country not in regions or not parts:
                continue
            region = region_for(regions[country], gazetteer, parts)
            if region is not None and region not in out[country]:
                out[country].append(region)
        if band["country"] in regions:
            stats[band["country"]][1] += 1
            stats[band["country"]][0] += bool(out.get(band["country"]))
        if out:
            placed[band["id"]] = dict(out)
    return placed, stats


def geometry(cr: CountryRegions) -> dict:
    """Region fills, plus the borders between different regions (inner borders of grouped regions disappear)."""
    fills = []
    segment_regions: dict[tuple[Point, Point], set[int]] = defaultdict(set)
    for unit in cr.units:
        coordinates = [[oriented(ring, i == 0) for i, ring in enumerate(polygon)] for polygon in unit.polygons]
        fills.append(
            {
                "type": "Feature",
                "properties": {"r": unit.region},
                "geometry": {"type": "MultiPolygon", "coordinates": coordinates},
            }
        )
        for polygon in unit.polygons:
            for ring in polygon:
                for a, b in zip(ring, ring[1:]):
                    segment_regions[(a, b) if a < b else (b, a)].add(unit.region)
    lines = [
        [[a[0] / SCALE, a[1] / SCALE], [b[0] / SCALE, b[1] / SCALE]]
        for (a, b), regions in segment_regions.items()
        if len(regions) > 1
    ]
    merged: list[list] = []  # join consecutive segments into polylines
    for line in lines:
        if merged and merged[-1][-1] == line[0]:
            merged[-1].append(line[1])
        else:
            merged.append(list(line))
    return {
        "regions": cr.regions,
        "fills": {"type": "FeatureCollection", "features": fills},
        "borders": {"type": "MultiLineString", "coordinates": merged},
    }


def main(argv: list[str] | None = None) -> None:
    bands = read_json(paths.DATASET)
    countries = {b["country"] for b in bands}
    known = countries - {INTERNATIONAL, UNKNOWN}
    regions = country_regions(read_json(paths.GEO_DIR / "admin1.geojson")["features"], countries)
    gazetteer = Gazetteer(
        paths.GEO_DIR / "cities1000.txt",
        paths.GEO_DIR / "admin1Codes.txt",
        {cr.iso for cr in regions.values() if cr.iso},
    )
    placed, stats = band_region_map(bands, regions, gazetteer, known)
    write_json(paths.REGIONS_DIR / "band_regions.json", placed, compact=True)
    for country, cr in regions.items():
        write_json(paths.REGIONS_DIR / "geo" / f"{country}.json", geometry(cr), compact=True)

    placed_total, total = sum(s[0] for s in stats.values()), sum(s[1] for s in stats.values())
    print("bands with a region:", placed_total, "/", total, f"({placed_total / total:.0%})")
    print("countries without regional geometry:", sorted(known - set(regions)))
