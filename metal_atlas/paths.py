"""Where every file of the project lives. All other modules take their paths from here."""

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# master dataset: one record per band (outside the repository; METAL_ATLAS_DATASET overrides the location)
DATASET = Path(os.environ.get("METAL_ATLAS_DATASET", Path.home() / "metal_archives_bands.json"))

MAP_DIR = ROOT / "map"
SITE_DIR = MAP_DIR / "site"  # the website: index.html plus the generated JSON
PUBLIC_DIR = MAP_DIR / "public"  # what gets published (built from SITE_DIR by `bundle`)
GEO_DIR = MAP_DIR / "geo_dl"  # Natural Earth + GeoNames downloads
REGIONS_DIR = MAP_DIR / "regions_out"  # band -> region, and region geometry per country
REVIEWS_PAGES_DIR = MAP_DIR / "reviews_pages"  # full review list (initial scrape)
REVIEWS_NEW_DIR = MAP_DIR / "reviews_new"  # monthly review lists read by `update`
REVIEWS_BY_BAND = MAP_DIR / "reviews_by_band.json"  # band id -> [review count, rating sum]
MA_COUNTRIES = MAP_DIR / "ma_countries.json"  # country name -> Metal Archives country code
UPDATE_STATE = MAP_DIR / "update_state.json"  # date of the last change picked up by `update`

SCRAPER_DIR = ROOT / "scraper"
SEARCH_PAGES_DIR = SCRAPER_DIR / "pages"  # raw advanced-search responses
MEMBERS_DIR = SCRAPER_DIR / "members"  # lineup, photo, logo and review passage per game band
DISCO_DIR = SCRAPER_DIR / "disco"  # Metal Archives discography per game band
ITUNES_DIR = SCRAPER_DIR / "itunes"  # iTunes verification per game band

DIST_DIR = ROOT / "dist"  # packed data snapshots (see `data`)
