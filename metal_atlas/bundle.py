"""Builds map/public: the site ready for a static host (GitHub Pages).

site/index.html has no <html>, <head> or <body>: it was first written for claude.ai artifacts, which add them.
Static hosts serve files as they are, so the page gets wrapped in a full HTML document here. The data files are
hard-linked, not copied (no extra disk space).

The front end (app.js) must be built first: npm run build --prefix web. The page asks for it as app.js?v=<hash of the
file>, so browsers fetch the new code after each deploy instead of a cached copy (GitHub Pages caches for 10 minutes).

Usage: python3 -m metal_atlas bundle
"""

import hashlib
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


APP_SCRIPT = "app.js"  # the front end, compiled from web/ (TypeScript)


class MissingAppScript(RuntimeError):
    """map/site/app.js does not exist: the TypeScript front end was not built."""


def versioned_script(page: str, script: bytes) -> str:
    """The page with its app.js reference made unique to this build (a cache-busting query string)."""
    digest = hashlib.sha256(script).hexdigest()[:10]
    return page.replace(f'src="{APP_SCRIPT}"', f'src="{APP_SCRIPT}?v={digest}"')


def bundle(site: Path, public: Path) -> int:
    """Rebuilds ``public`` from ``site``. Returns the number of files."""
    if not (site / APP_SCRIPT).exists():
        raise MissingAppScript(
            f"{site / APP_SCRIPT} is missing: build the front end first (npm run build --prefix web)"
        )
    shutil.rmtree(public, ignore_errors=True)
    shutil.copytree(site, public, copy_function=os.link, ignore=shutil.ignore_patterns("index.html", ".*"))
    page = (site / "index.html").read_text(encoding="utf-8")
    page = versioned_script(page, (site / APP_SCRIPT).read_bytes())
    (public / "index.html").write_text(wrap_document(page), encoding="utf-8")
    return sum(len(files) for _, _, files in os.walk(public))


def main(argv: list[str] | None = None) -> None:
    print(f"{paths.PUBLIC_DIR.relative_to(paths.ROOT)}/ ready: {bundle(paths.SITE_DIR, paths.PUBLIC_DIR)} files")
