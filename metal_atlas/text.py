"""Text helpers shared by the scrapers and the build steps."""

import html
import re
import unicodedata

_TAG = re.compile(r"<[^>]+>")
_BR = re.compile(r"<br\s*/?>")


def fold(text: str) -> str:
    """Lowercase without accents: "Motörhead" -> "motorhead". Used to compare names."""
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch)).lower()


def strip_html(fragment: str | None) -> str:
    """Plain text from an HTML fragment: line breaks kept, tags removed, entities decoded."""
    return html.unescape(_TAG.sub("", _BR.sub("\n", fragment or ""))).strip()


def field_text(fragment: str | None) -> str | None:
    """Like strip_html, but Metal Archives' empty values ("" or "N/A") become None."""
    text = strip_html(fragment)
    return None if text in ("", "N/A") else text


def split_list(text: str) -> list[str]:
    """'a, b; c' -> ['a', 'b', 'c']"""
    return [part.strip() for part in re.split(r"[;,]", text) if part.strip()]
