"""Command line: python3 -m metal_atlas <command> [arguments]"""

import importlib
import sys

# command -> (module, one-line description); each module has a main(argv)
COMMANDS = {
    "update": ("update", "update the data from Metal Archives and rebuild everything (what the daily job runs)"),
    "data": ("data", "pull / push the data from / to the `data` release on GitHub"),
    "bundle": ("bundle", "build map/public, the site ready to publish"),
    "build": ("build", "build the map data (map/site) from the master dataset"),
    "regions": ("regions", "place bands in regions and build the region geometry"),
    "game": ("game", "build game.json and previews.json"),
    "members": ("members", "download lineups, photos and logos of the game bands"),
    "discographies": ("discographies", "download the discography of every band (for the Oracle)"),
    "oracle": ("oracle", "build oracle.json, the data the Oracle answers questions from"),
    "verify": ("verify", "match the game bands to their iTunes artist and store their previews"),
    "reviews": ("reviews", "download the full review list and count reviews per band"),
    "scrape": ("scrape", "download the full Metal Archives band search (initial scrape)"),
    "merge": ("merge", "merge the scraped search pages into the master dataset"),
    "probe": ("probe", "try advanced-search queries"),
}


def usage() -> str:
    lines = ["usage: python3 -m metal_atlas <command> [arguments]", "", "commands:"]
    lines += [f"  {name:9} {description}" for name, (_, description) in COMMANDS.items()]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> None:
    argv = sys.argv[1:] if argv is None else argv
    if not argv or argv[0] not in COMMANDS:
        sys.exit(usage())
    module = importlib.import_module(f"metal_atlas.{COMMANDS[argv[0]][0]}")
    module.main(argv[1:])


if __name__ == "__main__":
    main()
