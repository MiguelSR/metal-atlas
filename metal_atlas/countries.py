"""Countries in band locations: aliases, and the countries of "International" bands."""

import re

INTERNATIONAL = "International"
UNKNOWN = "Unknown"

# how locations name countries -> Metal Archives' country names
ALIASES = {
    "US": "United States",
    "USA": "United States",
    "U.S.A.": "United States",
    "UK": "United Kingdom",
    "England": "United Kingdom",
    "Scotland": "United Kingdom",
    "Wales": "United Kingdom",
    "Northern Ireland": "United Kingdom",
    "Turkey": "Türkiye",
    "South Korea": "Korea, South",
    "Czech Republic": "Czechia",
    "Holland": "Netherlands",
    "The Netherlands": "Netherlands",
}

_PARENS = re.compile(r"\([^)]*\)")  # "(early)", "(later)"…


def canonical_country(name: str) -> str:
    return ALIASES.get(name, name)


def without_eras(location: str | None) -> str:
    """'Oslo (early); Bergen (later)' -> 'Oslo ; Bergen '"""
    return _PARENS.sub("", location or "")


def location_segments(location: str | None) -> list[list[str]]:
    """Places of each era, without the era notes.

    'Stockholm (early); Miami, Florida, United States (later)' -> [['Stockholm'], ['Miami', 'Florida', 'United States']]
    """
    segments = []
    for segment in re.split(r"[/;]", without_eras(location)):
        parts = [p.strip() for p in segment.split(",") if p.strip()]
        if parts:
            segments.append(parts)
    return segments


def band_countries(country: str, location: str | None, known: set[str]) -> list[str]:
    """The countries a band counts in: its own, or for "International" bands those named in its location."""
    if country != INTERNATIONAL:
        return [country]
    found: list[str] = []
    for parts in location_segments(location):
        for part in reversed(parts):  # "City, Region, Country": the country is usually last
            part = canonical_country(part)
            if part in known:
                if part not in found:
                    found.append(part)
                break
    return found or [INTERNATIONAL]
