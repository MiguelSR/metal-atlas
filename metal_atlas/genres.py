"""Splits Metal Archives' free-text genres into atomic genres.

"Crust Punk (early); Progressive Sludge/Groove Metal (later)"
    -> ["Crust Punk", "Progressive Sludge Metal", "Groove Metal"]
"""

import re

# words that end a genre name; a fragment without one borrows it from the last fragment ("Sludge/Groove Metal")
GENRE_NOUNS = (
    "Metal",
    "Rock",
    "core",
    "Grind",
    "Punk",
    "Noise",
    "Ambient",
    "Drone",
    "Industrial",
    "Crust",
    "Folk",
    "Shoegaze",
    "Wave",
    "Electronic",
    "Neofolk",
    "Dungeon Synth",
    "Darkwave",
    "Jazz",
    "Blues",
    "Hardcore",
    "Grindcore",
    "NWOBHM",
    "Goregrind",
    "Pornogrind",
    "Noisegrind",
    "Powerviolence",
    "Fusion",
    "Music",
    "Synth",
    "Experimental",
    "Avant-garde",
)

# era notes and influence remarks: "(early)", "with … influences"
_NOISE = re.compile(r"\((?:early|mid|later|[^)]*)\)|\b(?:with|and|influenced|influences|elements|touches)\b.*$", re.I)


def ends_with_genre_noun(text: str) -> bool:
    return any(text.endswith(n) or text.lower().endswith(n.lower()) for n in GENRE_NOUNS)


def split_genres(genre: str | None) -> list[str]:
    """Atomic genres of a band, in order of appearance, without repeats."""
    out: list[str] = []
    for era in (genre or "").split(";"):
        for chunk in era.split(","):
            chunk = _NOISE.sub("", chunk).strip(" .-")
            parts = [p.strip() for p in chunk.split("/") if p.strip()]
            if not parts:
                continue
            last = parts[-1]
            suffix = last.split()[-1] if ends_with_genre_noun(last) and " " in last else None
            for part in parts:
                if not ends_with_genre_noun(part) and suffix:
                    part = f"{part} {suffix}"
                part = re.sub(r"\s+", " ", part)
                if part and part not in out:
                    out.append(part)
    return out
