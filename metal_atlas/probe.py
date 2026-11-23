"""Tries advanced-search queries: how many bands each returns, and which columns.

Usage: python3 -m metal_atlas probe "status=1" "location=*" …
"""

import sys
import time
import urllib.parse

from . import metal_archives as ma
from .net import fetch_json


def main(argv: list[str] | None = None) -> None:
    argv = sys.argv[1:] if argv is None else argv
    for query in argv:
        params = {
            **dict(urllib.parse.parse_qsl(query, keep_blank_values=True)),
            "yearCreationFrom": "",
            "yearCreationTo": "",
        }
        data = fetch_json(ma.advanced_search_url(params, length=1))
        first = data["aaData"][0] if data["aaData"] else []
        print(query, data["iTotalRecords"], len(first), [c[:30] for c in first[1:]])
        time.sleep(1)
