# Metal Atlas

An interactive map of the ~200,000 bands in [Encyclopaedia Metallum (Metal Archives)](https://www.metal-archives.com), with a game mode where you guess bands from their music.

**Live site:** https://miguelsr.js.org/metal-atlas/

It is a static site: a single `index.html` plus precomputed JSON files. No server and no database. It is published automatically on **GitHub Pages** on every commit to `main`.

---

## Contents

1. [What the site does](#what-the-site-does)
2. [Project layout](#project-layout)
3. [How the data is built (pipeline)](#how-the-data-is-built-pipeline)
4. [Commands](#commands)
5. [Common tasks](#common-tasks)
6. [Data formats](#data-formats)
7. [How it works](#how-it-works)
8. [Limits and known issues](#limits-and-known-issues)

---

## What the site does

The page has **two modes**, switched with the small button next to the title (**Game** / **← Map**). Map mode is the default.

### Map mode

- **World map colored by leading genre**: each country takes the color of the genre with the most bands. The legend lists the genres and how many countries each one leads.
- **Formation-year filter** (from / to, with quick ranges). With a year filter on, bands without a known formation year are left out.
- **Region view**: clicking a country or zooming in splits the map into regions (states, provinces…). Bands whose location could not be placed only appear in the country card.
- **Country or region card** (on click):
  - number of bands and active bands. Both numbers link to **Metal Archives' advanced search with the same filters** (country, region, genre, years, band name, active);
  - top 10 genres;
  - **predictive genre search**, to find any subgenre even outside the top 10. Results are sorted by band count.
- **Bands of one genre**, sorted by relevance (see [Relevance](#relevance)), with year, status, reviews and a link to each band on Metal Archives.
- **Band search by name** (top bar), across all 200,000 bands.
- **Unobtrusive player**: the ▶ icon next to each band plays a 30-second Apple Music preview on the page itself. Nothing plays until you press it.
- **Country finder** and zoom controls.

### Game mode ("Name that band")

- **10 rounds.** Each one starts with a 30-second clip of a song; type the band's name (suggestions appear as you type).
- **Points:** a correct guess with no clues is worth 7 points. Each clue you reveal costs one, and a wrong guess reveals the next clue automatically. The clues:
  - Origin (city/area and country)
  - Year formed
  - A passage from a review (with the band and album names hidden)
  - Lineup
  - An album title
  - A band photo
- **Clues come in random order**, one at a time: the current one gets a large spotlight card ("Clue 3 of 6"), the earlier ones move to a compact list below. Only the clues a band actually has are used.
- **Forgiving answers:** case, accents, punctuation and small typos are ignored.
- **When the round ends** you see the logo, the band photo, the cover of the album that was playing, and every clue.
- **5 difficulty levels**, by the band's position in the relevance ranking:

  | Level | Bands (rank) |
  |---|---|
  | 1 · Household names | 1 – 250 |
  | 2 · Well known | 251 – 800 |
  | 3 · Fan territory | 801 – 2,000 |
  | 4 · Deep cuts | 2,001 – 3,800 |
  | 5 · Underground | 3,801 – 6,000 |

- **Sound check** before starting, with a "Test sound" button (a synthesized guitar chord), because many players did not realize music was supposed to play.

### Language

The interface is in **English and Spanish**. It follows the browser's language and can be switched with the **EN · ES** button (the choice is remembered). Country names are translated with the browser's `Intl` API.

---

## Project layout

```
~/metal_archives_bands.json      <- master dataset: every band (outside the project folder, ~100 MB)

~/metal-archives/
├── README.md
├── .github/workflows/pages.yml  <- publishes the site on GitHub Pages on every push to main
├── scraper/                     <- downloads from Metal Archives and iTunes
│   ├── scrape.py                  full Metal Archives advanced search -> pages/
│   ├── merge.py                   pages/ -> ~/metal_archives_bands.json
│   ├── probe.py                   helper to try queries against the Metal Archives search
│   ├── members.py                 lineup, photo, logo and review passage (top 6,000 bands) -> members/
│   ├── verify.py                  finds the right band on iTunes and stores its previews -> itunes/, disco/
│   ├── night.sh                   long-running job: verify.py in a loop + rebuild every 30 min
│   ├── pages/                     raw Metal Archives search responses (10 "jobs")
│   ├── members/<id>.json          extras for each game band
│   ├── disco/<id>.json            Metal Archives discography (for verification and the album clue)
│   ├── itunes/<id>.json           iTunes verification result
│   └── *.log                      logs
└── map/                         <- builds the site
    ├── reviews.py                 full Metal Archives review list -> reviews_pages/, reviews_by_band.json
    ├── regions.py                 places each band in a region of its country -> regions_out/
    ├── build.py                   map data -> site/
    ├── game.py                    game data -> site/game.json
    ├── make_netlify.py            site/ -> netlify/, ready to publish
    ├── update.py                  incremental update (new/changed bands + new reviews)
    ├── ma_countries.json          Metal Archives country codes (for search links)
    ├── update_state.json          date of the last update
    ├── reviews_pages/             full review list (initial scrape)
    ├── reviews_new/               reviews added by update.py
    ├── reviews_by_band.json       review count and rating sum per band
    ├── geo_dl/                    downloaded geography: Natural Earth (regions) and GeoNames (cities)
    ├── regions_out/               band -> region, and region geometry per country
    ├── site/                      the website
    │   ├── index.html               the whole app: HTML + CSS + JS
    │   ├── index.json               per-country summary: genres × years
    │   ├── bands.json               index of every band, sorted by relevance
    │   ├── c/<n>.json               bands of each country
    │   ├── r/<n>.json               regions of each country (geometry + summaries)
    │   ├── game.json                game bands, with their clues and previews
    │   └── countries-50m.json       world map (TopoJSON)
    └── netlify/                   local copy of what gets published (generated; not in the repo)
```

> **`site/` vs `netlify/`:** `site/index.html` has no `<html>`, `<head>` or `<body>`, because it was first written for claude.ai artifacts, which add them. `make_netlify.py` wraps it in a full HTML document and hard-links the JSON files (no extra disk space). **Edit `site/`. What gets published is the output of `make_netlify.py`**, which GitHub builds on every push. The name `netlify` is historical: the site used to be hosted on Netlify.

Only the code, this README and `map/site/` are in the repository. Downloads and caches (~500 MB) stay local; see `.gitignore`.

---

## How the data is built (pipeline)

```
Metal Archives ──scrape.py──► pages/ ──merge.py──► ~/metal_archives_bands.json ─┬─ regions.py ─► regions_out/ ─┐
               ──reviews.py─► reviews_by_band.json ─────────────────────────────┴─────────── build.py ◄──────┘
                                                                                                │
                                                                                   site/ (map: index, c/, r/, bands.json)
                                                                                                │
Metal Archives ──members.py─► members/  ─┐                                                      │
iTunes ─────────verify.py───► itunes/, disco/ ─┴──────── game.py ──► site/game.json             │
                                                                          │                     │
                                                                          └─ make_netlify.py ◄──┘ ──► netlify/
```

| Step | Script | What it does | Approx. time |
|---|---|---|---|
| 1 | `scraper/scrape.py` | Downloads the Metal Archives advanced search in 10 passes (by status, location, themes, notes and year), because each pass only returns some columns. Resumable. | hours (once) |
| 2 | `scraper/merge.py` | Merges the 10 passes into one record per band. | seconds |
| 3 | `map/reviews.py` | Downloads the alphabetical list of all reviews (~700 pages) and counts reviews and average rating per band. | once |
| 4 | `map/regions.py` | Places each band in a region from its "Location" field, using GeoNames and Natural Earth. | ~15 s |
| 5 | `map/build.py` | Normalizes genres, resolves "International" bands, computes relevance and writes the site's JSON. | ~30 s |
| 6 | `scraper/members.py` | For the 6,000 most relevant bands: lineup, photo, logo and a review passage without names. | ~3 h the first time |
| 7 | `scraper/verify.py` | Looks up each game band on iTunes and confirms which artist is the right one by comparing albums (see [iTunes verification](#itunes-verification)). | ~20 h the first time (one call every 6 s) |
| 8 | `map/game.py` | Puts everything together in `site/game.json`. | seconds |
| 9 | `map/make_netlify.py` | Builds `netlify/`. | seconds |

Steps 1–3 and 6 are only needed once. After that, `update.py` keeps the data up to date incrementally.

---

## Commands

Everything is Python 3 standard library (no dependencies) plus `curl`. Paths are relative to `~/metal-archives`.

### Everyday use

| Command | Purpose |
|---|---|
| `cd map && python3 update.py` | **Update everything** with Metal Archives' changes since last time and rebuild. |
| `cd map && python3 update.py --dry-run` | See how many bands and reviews changed, without touching anything. |
| `cd map && python3 update.py --since 2026-11-01` | Update from a given date. |
| `cd map && python3 game.py && python3 make_netlify.py` | Rebuild the game data and the publish folder (e.g. after verifying more bands). |
| `cd map && python3 make_netlify.py` | Rebuild only `netlify/` (e.g. after editing `site/index.html`). |
| `git add -A && git commit -m "…" && git push` | Publish (see [Publishing](#publishing-a-new-version)). |
| `cd scraper && nohup caffeinate -ims bash night.sh > night.log 2>&1 &` | Run the iTunes verification in the background without letting the Mac sleep. |

### Full reference

| Script | Arguments | Notes |
|---|---|---|
| `scraper/scrape.py [job…]` | jobs: `status1`…`status6`, `location`, `themes`, `notes`, `year` (default: all) | `DELAY` env var (default 0.8 s between requests). Resumable. |
| `scraper/merge.py <output.json>` | dataset path | Usually `~/metal_archives_bands.json`. |
| `scraper/probe.py "<query>"` | advanced-search parameters | Prints how many results a query returns and which columns. |
| `scraper/members.py [N=6000] [threads=3]` | | Skips bands already downloaded, so re-running only fetches the missing ones. |
| `scraper/verify.py [N=6000] [threads=2]` | `ITUNES_GAP` env var (seconds between iTunes calls; default 3.2) | Skips bands already verified. On a 403 from iTunes it pauses 15–30 min. |
| `scraper/night.sh` | `ITUNES_GAP` env var (default 6) | Up to 8 passes of `verify.py`; rebuilds `game.json` and `netlify/` every 30 min. |
| `map/reviews.py` | | Resumable. To keep reviews current, `update.py` is enough. |
| `map/regions.py` | | Needs `geo_dl/` (see below). |
| `map/build.py <folder>` | usually `site` | Without an argument it only prints test statistics. |
| `map/game.py [--mixed]` | | Default: **verified bands only**. `--mixed`: unverified bands too, with live iTunes search. |
| `map/make_netlify.py` | | |
| `map/update.py [--dry-run] [--since YYYY-MM-DD]` | | See [Updating the data](#updating-the-data). |

**`geo_dl/`** holds `admin1.geojson` (Natural Earth 10m, first-level administrative divisions), `cities1000.txt` and `admin1Codes.txt` (GeoNames). They are already downloaded.

---

## Common tasks

### Publishing a new version

Commit and push the changes in `map/site/` (and the code):

```bash
cd ~/metal-archives
git add -A && git commit -m "Update data" && git push
```

GitHub Actions runs `map/make_netlify.py` and publishes the result at https://miguelsr.js.org/metal-atlas/ in about a minute. Progress and errors: the repo's **Actions** tab, or `gh run list`.

**The caches only exist on the local machine.** The iTunes verification (`scraper/itunes/`) took about 20 hours, so keep a backup of `~/metal-archives` and `~/metal_archives_bands.json`.

### Updating the data

```bash
cd ~/metal-archives/map
python3 update.py --dry-run     # optional: see how much changed
nohup caffeinate -ims python3 update.py > update.log 2>&1 &
tail -f update.log              # follow progress; it ends with "done…"
```

What `update.py` does:

1. **Finds what changed** by reading two Metal Archives lists, month by month and page by page (200 per page, newest first), until it reaches the date of the last update:
   - *What's new* (`archives/ajax-band-list/selection/YYYY-MM/by/created`)
   - *What's updated* (`…/by/modified`)
2. **Finds new reviews** in the monthly "latest reviews" list (`review/ajax-list-browse/by/date/selection/YYYY-MM`). A review is identified by its album id and the reviewer's user id (a user reviews an album only once), so the ones already counted are skipped. This updates the review count of **every** band, not just the changed ones.
3. **Downloads the band page** of each new or changed band (1 request), plus:
   - **new bands:** an exact-name search, the only place that lists their aliases (a.k.a.);
   - **game bands:** lineup, photo and logo (from the same page) and their discography.
   - Bands that return 404 (deleted from Metal Archives) are removed.
4. **Saves** `~/metal_archives_bands.json` (keeping the previous one as `~/metal_archives_bands.json.bak`) and `reviews_by_band.json`.
5. **Rebuilds:** `regions.py` → `build.py` → `members.py` and `verify.py` (only for bands new to the top 6,000) → `game.py` → `make_netlify.py`.
6. **Records** the date of the newest change in `update_state.json`.

**How it knows where to start:** `map/update_state.json` (`{"since": "YYYY-MM-DD HH:MM"}`, in Metal Archives server time, about 6 h behind Central European time).
- It **always** starts one day earlier, to be safe: going over a band twice does no harm.
- **If the file does not exist**, it starts from 2026-11-21, the date of the full scrape.
- **To force a date**, use `--since`.

Time: a little over 1 s per changed band (request + 0.8 s courtesy pause), plus a few minutes of rebuilding. In November 2026 about 1,000 bands changed per day; the first run (~2,000 bands) took about 45 minutes. Running it often keeps each pass short.

After updating, publish with `git add -A && git commit && git push`.

### Verifying more game bands on iTunes

```bash
cd ~/metal-archives/scraper
nohup caffeinate -ims bash night.sh > night.log 2>&1 &
tail night.log        # a "levels: […]" line every 30 min
tail verify.log       # iTunes block warnings (403)
```

It can run alongside `update.py`: they talk to different servers.

### Changing texts, colors or behavior

Everything is in `map/site/index.html`. Run `python3 map/make_netlify.py` afterwards to check locally, then push.

- **Texts:** the `TX` dictionary (keys `en` and `es`) near the top of the script, used through `t("key", …)`.
- **Game levels:** `LEVELS` in `game.py`; their names in `TX.*.levels`.

---

## Data formats

### `~/metal_archives_bands.json` (master dataset)

A list with one record per band:

```json
{"id": 84, "name": "Yngwie Malmsteen", "aka": "Rising Force, …", "aka_list": ["Rising Force", …],
 "url": "https://www.metal-archives.com/bands/Yngwie_Malmsteen/84",
 "genre": "Neoclassical Power Metal/Shred", "country": "Sweden",
 "location": "Stockholm (early); Miami, Florida, United States (later)",
 "status": "Active", "formed_in": 1978, "themes": "Society, War, …",
 "label": "Rising Force Records",            // "000INDIE000" = no label
 "notes": "…", "notes_truncated": true, "contact_emails": null}
```

### Site files (`site/`)

Compact (arrays instead of objects) to keep them small.

| File | Contents |
|---|---|
| `index.json` | `genres`: list of genres (by band count). `countries[]`: `{name, file, r (has regions), cc (Metal Archives country code), y: {year: [bands, active]}, g: {genre: {year: count}}}`. Enough for the map to compute colors and filters without loading any band. |
| `c/<n>.json` | Bands of one country: `labels` and `rows` = `[id, name, slug\|0, year, status, label idx, genre text, [genre idx], reviews, avg rating, [regions]]`, sorted by relevance. |
| `r/<n>.json` | Regions of one country: names, geometry (fills and borders) and the same genre × year summary per region. |
| `bands.json` | Global index for the band search and the game: parallel columns `n` (names), `y` (years), `a` (active), `g` (genres), `l` (country + regions), `id`, `s` (non-standard slugs). Sorted by relevance. |
| `game.json` | `levels`: 5 lists of indices. `b`: rows `[id, name, slug, year, countries, members, lineup header, photo, review, review %, logo, iTunes artist id, [albums], [[preview url, song, album, cover], …], location]`. Up to 5 songs per band, from different albums, with shortened URLs (`game.py` strips the common prefix, `index.html` puts it back). |

### Scraper caches

| File | Contents |
|---|---|
| `members/<id>.json` | `{h: lineup header, m: [[name, instrument]…], p: photo, lg: logo, r: review passage, ra: reviewed album, rs: rating}` |
| `disco/<id>.json` | `[[album id, title, type, year], …]` |
| `itunes/<id>.json` | `{a: artist id, c: [matching album ids], n: [matching titles], t: [[preview, song, album, cover]…], v: 3}`. An empty `t` means the band was not found on iTunes. |

---

## How it works

### Genres

The Metal Archives genre is free text ("Crust Punk (early); Progressive Sludge/Groove Metal (later)"). `build.py` splits it into atomic genres:

- **splits** by era (`;`), commas and slashes;
- **removes** "(early)", "with … influences", etc.;
- **completes** loose fragments: "Sludge/Groove Metal" → "Sludge Metal" + "Groove Metal".

A band counts once for each of its genres, so per-genre totals overlap.

### Countries and regions

- **"International" bands** are assigned to the countries recognized in their location field.
- **Regions:** `regions.py` looks up each band's location in the GeoNames city list and places the city's coordinates inside a Natural Earth regional polygon.
- **Grouped countries:** for some countries (United Kingdom, Spain, Italy, France…) Natural Earth has very small units, so they are grouped by region.

### Links to Metal Archives' search

The band counts in each card link to `metal-archives.com/search/advanced/searching/bands` with the card's filters: country code (`country[]`), years (`yearCreationFrom/To`), genre, band name, `status[]=1` for active bands and, in region cards, the region name as `location`.
- **Counts are close but not identical** (e.g. Spain from 1990: 4,494 on Metal Archives vs 4,606 here). Metal Archives matches genre and location as text, and the map also counts "International" bands under their countries.
- **Region names:** for grouped regions the page translates local names to the English ones Metal Archives uses ("Cataluña" → "Catalonia").
- **No region link** for the United Kingdom and Slovenia, whose regions are statistical areas that never appear in band locations.

### Relevance

Used to sort the lists and to build the game levels. Computed in `build.py`:

| Weight | Signal | Why |
|---|---|---|
| 55 % | number of Metal Archives reviews (log) | the best popularity signal available |
| 30 % | age in Metal Archives (low id = added early) | the first bands added (2002–2005) are mostly the classics |
| 10 % | label size (label's bands in the dataset) | bigger labels, better-known bands |
| 5 % | long notes | important bands are better documented |

### Audio previews

They come from the **iTunes Search API**: free, no key, and callable from the browser. Every song has a 30-second m4a at `audio-ssl.itunes.apple.com`. There are two ways to get one:

- **Stored preview** (verified bands): the audio URL is already in `game.json`, so the browser never calls the iTunes API. It is always the right band. The Network tab only shows an opaque URL, and the file carries no artist or title.
- **Live search** (the ▶ in map mode): the browser looks the artist up by name on iTunes and takes their songs. With shared names (there are 40+ "Hydra" on iTunes) another band may play.

**The game only uses verified bands** (5,099 of 6,000 as of 2026-11-23), so the right band always plays and the browser never calls the iTunes API during a game. The remaining ~900 are not on iTunes with a matching discography, almost always because they are not on Apple Music. `game.py --mixed` would add them with live search; it was dropped because it led to "No music" and namesakes.

### iTunes verification

`verify.py` decides which of the iTunes artists with the same name is the Metal Archives band:

1. Downloads the Metal Archives discography.
2. Searches iTunes for every artist with exactly that name, metal/rock genres first, up to 12.
3. With one more call, fetches the songs of all those candidates.
4. The winner is the candidate with the most albums whose title matches the discography. Titles are normalized without "Remastered", "Deluxe", parentheses, etc. A self-titled album only counts if the year matches too (±1).
5. Keeps up to 12 songs, **only from the matching albums**. So when iTunes mixes two namesake bands on one artist page (it happened with Graveyard from Spain and from Sweden), only the right one plays.

### Review passage

`members.py` takes the band's highest-rated review and looks for a 140–320 character stretch of whole sentences that mentions neither the band nor the album. It prefers middle paragraphs, which tend to describe the sound.

---

## Limits and known issues

- **iTunes rate limiting is strict.** The documented limit is about 20 calls per minute per IP, but with sustained traffic it blocks earlier (HTTP 403) and the block lasts a while.
  - **It also affects your browser**, which shares the IP: while verifying, the map's ▶ may fail at home. Site visitors are not affected.
  - `verify.py` makes one call every 6 s and pauses 15–30 min on a 403.
  - If more speed were ever needed, the official route is the Apple Music API, which requires an Apple Developer account.
- **Live search (map ▶):** a namesake band may play, or no music may be found.
- **Review passages can mention band members** (e.g. a singer's name). The filter only hides the band and album names.
- **`game.json` is readable:** a curious player could look up the URL of the song that is playing. It was obfuscated once and the obfuscation was removed on purpose.
- **Duplicate reviews in the initial scrape:** the full review list has 137,809 rows but 135,553 distinct reviews (rows probably repeated while paginating). Some bands' review counts are inflated by about 1.6 %; the effect on relevance is minimal.
- **`update.py` does not detect:**
  - new aliases of bands that already existed (it only fetches them for new bands);
  - deleted reviews (it only adds new ones).
- **Metal Archives dates** use the Metal Archives server's time zone, which is why each update goes back one extra day.
- **Be polite:** every script that queries Metal Archives waits ~0.8 s between requests and retries with growing waits. Do not lower those delays.

---

**Data credits:** [Encyclopaedia Metallum](https://www.metal-archives.com) · [Natural Earth](https://www.naturalearthdata.com) · [GeoNames](https://www.geonames.org) (CC BY 4.0) · audio previews via Apple Music / iTunes Search API.
