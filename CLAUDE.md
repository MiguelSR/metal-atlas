# CLAUDE.md

Context for working on Metal Atlas from scratch. **README.md is the reference** for what the project does, its layout, commands, data formats and pipeline; read it first. This file holds what the README does not: decisions and why they were taken, the owner's preferences, gotchas, and how to check changes.

**Keep this file current.** When a decision is taken (a design choice, a rejected approach, a new convention, a preference the owner states), add it to the right section below in the same change that implements it, with the reason. Remove what stops being true. Keep it short: rationale and pitfalls, not a changelog.

## The project in one paragraph

Static site (https://miguelsr.js.org/metal-atlas/, repo `MiguelSR/metal-atlas`, public) with a world map of the ~200,000 bands in Metal Archives (MA) and a "name that band" game with 30 s Apple Music previews. Python package `metal_atlas/` scrapes MA and iTunes and builds JSON; `map/site/index.html` is the whole front end (vanilla JS + d3, no build step). GitHub Actions updates the data daily and publishes on GitHub Pages. Data lives in the `data` release, not in git.

## Working with the owner

- **Conversation in Spanish; code, comments, commit messages, README and this file in English.** The site UI is bilingual (EN/ES, `TX` dictionary in index.html); every new UI string needs both languages.
- **Ask before outward-facing actions** that weren't requested (new repos, deleting releases, changing Pages settings). Pushing to `main` is the normal way to publish and is fine when the change was asked for.
- **UI taste:** unobtrusive controls (small toggles, nothing that autoplays), no automatic retries that make the user wait ("worse experience"), visible feedback over silent behavior. When unsure about a visual change, explain the option instead of guessing.
- **Correctness of the music matters most:** the owner repeatedly reported wrong bands playing (namesakes: Nevermore US, Graveyard ESP, Hydra POL). Prefer "no preview" over a possibly wrong one.
- **Report honestly**, including numbers that turned out worse than estimated.

## Decisions and why

**Data and hosting**
- Hosting: Netlify first (manual uploads), then **GitHub Pages** (owner got tired of uploading). `bundle` exists because `site/index.html` was first written for claude.ai artifacts (no `<html>/<head>/<body>`); it wraps it into a full document in `map/public`.
- **Data in the `data` release, not in git**: ~70 MB that change daily would grow the repo >1 GB/year. Two assets (`state.tar.gz`, `site-data.tar.gz`) are overwritten on each update. GitHub (the release) is the source of truth; local data goes stale → `python -m metal_atlas data pull` before working locally.
- **The published dataset strips band notes and contact e-mails** (public asset; the site uses neither; `notes` becomes "…" so the relevance score is unchanged). A full local copy: `~/metal_archives_bands.full-2026-11-23.json` (owner's machine only).
- **Daily job** (`daily.yml`, 05:17 UTC) commits `map/update_state.json` so the repo stays "active" (GitHub disables schedules after 60 idle days) and history records each update. Consequence: always `git pull` before pushing.
- `update_state.json` is in git; everything else generated is ignored.

**Metal Archives**
- Requests go through **curl** (Cloudflare accepts it; MA also answers from GitHub runners, checked 2026-11-23). Keep the **0.8 s courtesy delay** and retries; never lower them.
- Blank `yearCreationFrom/To` in the advanced search includes bands without a year (164k → all 202k).
- "What's new/updated" lists give times in MA server time (~6 h behind Spain) and without year → `update` goes back one extra day.
- **A review is identified by (album id, user id)**: the last number of a review URL is the *user* id, not a review id (a past bug counted 0 new reviews because of this).
- The full review list repeats ~2,256 rows (pagination shifts); `reviews` now dedupes, but the counts in use come from the original scrape (~1.6 % high for some bands) until recounted.
- Band pages don't show aliases or review counts: aliases only via exact-name search (done for new bands only), review counts via the monthly "latest reviews" list.

**iTunes / audio**
- iTunes Search API: free, no key, CORS-enabled. Deezer was rejected (expiring preview URLs, no CORS).
- **Rate limit is harsh**: ~20 calls/min officially, much less under sustained load; 403 blocks last long and also block the owner's browser (same IP). Pace at one call per 6 s and pause 15–30 min on 403. Never fire bursts of iTunes calls from scripts or tests.
- **Verification** (`verify.match_artist`): candidates with exactly the band's name, metal/rock first; the winner has most album titles matching the MA discography; self-titled albums need the year (±1); only songs from matching albums are kept (iTunes merges namesakes on one artist page).
- **Game uses verified bands only** (5,099/6,000); the "mixed" mode with live search was dropped (wrong bands, "No music").
- **Map ▶** uses `previews.json` by band id. Unverified bands whose name is shared with another MA band get no preview (a name search can't tell them apart); live search only for unique names, skipping iTunes artists of verified bands.
- Preview/cover URLs are stored without their common prefix (game.json went 21 MB → 8.5 MB); index.html expands them (`AUDIO_URL`, `COVER_URL`). The owner accepted that a curious player can read `game.json`; obfuscation was tried and removed on request.

**Game design**
- 10 rounds, 7 points max, each revealed clue −1, a wrong guess reveals the next clue. Clues (index): 0 origin (city/area + country), 1 year, 2 review passage, 3 lineup, 4 album, 5 photo. **Random order per round**, only clues the band has; one clue in a spotlight card, earlier ones in a compact list.
- Levels are relevance-rank slices (`game.LEVELS`), 6,000 bands in total.
- Review passages hide band and album names but **can mention member names** (known issue, e.g. "David Wayne" for Metal Church).
- Sound check button (synthesized chord) because players didn't realize music was playing.

**Map**
- Card counts link to MA's advanced search with the active filters. Grouped regions (Spain, Italy, France) are translated to MA's English location names in `REGION_EN` (index.html); UK and Slovenia regions are statistical, so no region link.
- Genre search in the card sorts by band count (relevance), not alphabetically.

**Code**
- Python **3.15** (owner's explicit choice). Standard library only at runtime; dev tools in `requirements-dev.txt`.
- One module per step with `main(argv)`; pure functions for logic; paths only in `paths.py`; MA specifics only in `metal_archives.py`; HTTP only in `net.py`; atomic JSON writes.
- black (line length 120), flake8, pytest; pre-commit hook + `ci.yml`. JSON files are excluded from the end-of-file fixer (the bot commits generated JSON).

## Gotchas

- **CSS class collisions in index.html**: the map popup uses `.pop`, and `body.game-on .pop { display: none }` hides it in game mode. A game element once used class `pop` for an animation and vanished (the "reveal clue shows nothing" bug). Check existing selectors before naming classes.
- index.html's main script declares `t` (translation function): don't name locals `t` (a "Cannot declare a let variable twice" bug came from this).
- `make_netlify.py`/`map/netlify` and the scripts in `map/*.py`, `scraper/*.py` no longer exist (replaced by `metal_atlas/`); old notes may mention them.
- The daily job and a local `data push` can overwrite each other: don't push data while the job runs.
- `gh run watch` on a just-triggered run: wait a few seconds for it to appear.

## Checking changes

- `pre-commit run --all-files` (black, flake8, pytest). Tests must not use the network.
- **Refactors of the build steps**: generate outputs before and after (`regions`, `build`, `game`, `bundle`) and diff the files (`diff -rq`, `cmp`); explain every difference.
- **Front end**: there is no test suite. Check behavior in headless Chrome: serve `map/public` with `python -m http.server`, inject a test script into a copy of index.html that drives the UI (click buttons, set inputs) and writes a log into a `<pre id="__out">`, then run `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --virtual-time-budget=60000 --dump-dom URL` and read the log. Extract the main `<script>` and syntax-check it when editing JS by hand.
- **Pipeline end to end**: `gh workflow run daily.yml`, then check the run log ("dataset: +N new…", "levels: […]") and the site.

## Open ideas (not requested yet)

- Filter review passages that mention lineup members.
- Recount `reviews_by_band.json` from deduplicated reviews (pages + reviews_new).
- Verify bands beyond the top 6,000 to give more map ▶ buttons real previews.
