"""Builds map/public: the site ready for a static host (GitHub Pages).

site/index.html has no <html>, <head> or <body>: it was first written for claude.ai artifacts, which add them.
Static hosts serve files as they are, so the page gets wrapped in a full HTML document here. The data files are
hard-linked, not copied (no extra disk space).

Usage: python3 -m metal_atlas bundle
"""

import os
import shutil
from pathlib import Path

from . import paths

APP_START = '<div class="app">'  # where index.html's body content starts (everything before it goes in <head>)


def wrap_document(page: str) -> str:
    """A full HTML document around index.html's head content (styles, scripts) and body content."""
    cut = page.index(APP_START)
    head, body = page[:cut], page[cut:]
    return (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        f"{head}</head>\n<body>\n{body}\n</body>\n</html>\n"
    )


def bundle(site: Path, public: Path) -> int:
    """Rebuilds ``public`` from ``site``. Returns the number of files."""
    shutil.rmtree(public, ignore_errors=True)
    shutil.copytree(site, public, copy_function=os.link, ignore=shutil.ignore_patterns("index.html", ".*"))
    page = (site / "index.html").read_text(encoding="utf-8")
    (public / "index.html").write_text(wrap_document(page), encoding="utf-8")
    return sum(len(files) for _, _, files in os.walk(public))


def main(argv: list[str] | None = None) -> None:
    print(f"{paths.PUBLIC_DIR.relative_to(paths.ROOT)}/ ready: {bundle(paths.SITE_DIR, paths.PUBLIC_DIR)} files")
