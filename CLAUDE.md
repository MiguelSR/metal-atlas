# CLAUDE.md

Context for working on Metal Atlas from scratch. **README.md is the reference** for what the project does, its layout, commands, data formats and pipeline; read it first. This file holds what the README does not: decisions and why they were taken, the owner's preferences, gotchas, and how to check changes.

**Keep this file current.** When a decision is taken (a design choice, a rejected approach, a new convention, a preference the owner states), add it to the right section below in the same change that implements it, with the reason. Remove what stops being true. Keep it short: rationale and pitfalls, not a changelog.

## The project in one paragraph

Static site (https://miguelsr.js.org/metal-atlas/, repo `MiguelSR/metal-atlas`, public) with a world map of the ~200,000 bands in Metal Archives (MA) and a "name that band" game with 30 s Apple Music previews. Python package `metal_atlas/` scrapes MA and iTunes and builds JSON; the front end is TypeScript in `web/`, bundled by esbuild into `map/site/app.js` and loaded by `map/site/index.html` (HTML + CSS). GitHub Actions updates the data daily and publishes on GitHub Pages. Data lives in the `data` release, not in git.

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

**The Oracle** (owner's idea, 2026-11-24: "ask anything", running in the browser with Chrome's Prompt API and WebLLM as fallback; an intro panel that warns it is slow, and example questions)
- **On phones too, without a model** (decided 2026-11-24 once the rules alone scored like the model): Gemini Nano is desktop-only and WebLLM's 1.3 GB is too much; `isMobile()` (≤ 899 px or a coarse pointer) skips model detection and shows a phone intro (`oIntroMobile`, warns about ~7 MB). It was desktop-only at first.
- **Unsigned and band names** (owner's reports, 2026-11-24: "banda sin sello con más reseñas" gave a ranking of labels; "¿hay algún grupo que se llame Slayer?", "exactamente Killer", "empiece por Killer" listed every band). `unsigned` = label -1 in oracle.json (every band has a label or Unsigned/independent, so -1 is never "unknown"); "sin sello" must not trigger the label ranking. `name` + `nameMatch` (exact/prefix/contains/suffix). Owner asked to fold such reports into the example corpus and the evaluation, so each report becomes a template in `make-examples.ts` and questions in `eval/questions.ts`.
- **Review counts, ratings, low-end sorts** (owner's reports: "entre 5 y 10 reseñas", "valoración media más baja", "con menos reseñas"): `reviewsMin/Max`, `ratingMin/Max`, sorts `lowestRating` (bands with 3+ reviews, like `rating`) and `fewestReviews` (bands with at least one: most have none, which says nothing). Review and rating numbers are removed before reading years. The band total counts what the sort lists.
- **Pure genres** (owner: "primer grupo de doom puro" returned El Kaso Urkijo, Doom/Grindcore/Noise): `pureGenre` keeps bands whose every normalized genre contains the asked words and no other genre family (`GENRE_FAMILIES`, engine.ts). Epic/Funeral Doom count as pure doom; Blackened Doom, Drone Doom, Doom/Death don't. **Heavy and rock are kindred to doom** (owner: "consideremos Heavy/Doom o Doom Rock como doom puro"; `KINDRED` in engine.ts), so Black Sabbath is the first pure doom band. Cues: "puro", "sin mezclar", "only/solo <genre>", "pure"…
- **No training, no classic RAG.** Fine-tuning doesn't teach facts reliably, and vector retrieval can't count or rank ("which country has the most…"). The model translates the question into a small JSON query language (`oracle/query.ts`, constrained with a JSON schema); a deterministic engine answers it from `oracle.json`. Answers come from the data, never from the model.
- **No DuckDB/Parquet**: the query language is small, so a TypeScript engine over a columnar JSON is enough (filters over 200k rows take milliseconds), testable with Vitest, and avoids a ~30 MB WASM download and SQL written by a small model.
- **Small models are not reliable alone** (measured): Gemini Nano alone got 13/32 and 9/20, Qwen3.5-2B 11/32. They invent filters (a country, a genre, "missing: lyrics") and miss plain cues. Hence `refine`: rules read explicit cues and the model's additions are kept only if the question backs them. On a held-out set written after the rules: Nano + rules 17/20, rules alone 17/20. **The model adds little over the rules**; its value is translating places and themes and catching phrasings the rules don't know. Keep it honest: measure with `npm run eval`, and **write new questions in `web/eval/holdout.ts` before tuning**; tuning on a set inflates its score (both earlier sets went to 32/32 and 20/20 after tuning).
- WebLLM model: **Qwen3.5-2B** (same score as with Nano, ~6 s/question, ~1.5 min to load even when cached). Qwen3.5-0.8B hung in the evaluation. Loaded from esm.run at a pinned version (not bundled: it is large and only needed by some viewers); `enable_thinking: false`.
- Nothing big downloads without a click (owner: nothing intrusive): Gemini Nano loads by itself only if Chrome already has it; otherwise a button. Until a model is ready, questions are answered with the rules alone.
- **Example questions** (owner: "at least 300, 8 at random"; they stay until 🎲 is pressed, re-picking after each question "felt odd"): generated from the data (`npm run examples`), each validated with the rules alone (exact reading + a satisfying answer), 943 per language, committed in `src/oracle/examples.ts` (~50 KB of app.js). Generating them doubles as a test of the rules: every rejected template question is a phrasing the Oracle misreads (`DEBUG=1 npm run examples` lists them; that's how "Cannibal Corpse's" → "Cannibal" and "Heavy metal" as a label were found). `--set examples` in the eval checks that the model doesn't spoil them (60/60 with Nano).
- **Theme and place vocabulary is data, not rules** (owner, 2026-11-24: word-by-word tables like "cristianismo → christian" are "over-engineering" and don't scale). `src/oracle/vocab.ts` holds ~300 **theme concepts** (Spanish and English question words -> the English stems Metal Archives writes), written once by Claude in a session from the 1,394 theme terms used by 10+ bands (90 % of mentions), plus Spanish place names. A concept matches any of its stems; several concepts must all appear ("mitología eslava" -> myth + slav -> "Slavic mythology"); a theme never matches its "anti-" version. Generated in-session because the owner won't pay for the API beyond the subscription: **no API key, no LLM calls in the pipeline**. To extend it, add concepts by hand or in a session; the daily job doesn't touch it.
- After the vocabulary: 94/94 on the evaluation questions and 22/22 on a fresh set of theme questions (one expectation was wrong), **rules alone equal to rules + Gemini Nano**. The model currently adds nothing measurable; the owner's idea of asking the model one category at a time is still to be tried.
- Lineups and discographies exist only for the ~6,000 game bands (`members`/`verify` caches); the UI says so. Lyrics, songs, former members, similar bands and covers are answered with "not yet" (`missing` in the query).

**Code**
- Python **3.15** (owner's explicit choice). Standard library only at runtime; dev tools in `requirements-dev.txt`.
- One module per step with `main(argv)`; pure functions for logic; paths only in `paths.py`; MA specifics only in `metal_archives.py`; HTTP only in `net.py`; atomic JSON writes.
- black (line length 120), flake8, pytest; pre-commit hook + `ci.yml`. JSON files are excluded from the end-of-file fixer (the bot commits generated JSON).
- **Front end in TypeScript** (owner's request, 2026-11-24): strict `tsc` with `noUncheckedIndexedAccess`, ESLint (typescript-eslint strict + stylistic, type-aware), Prettier, Vitest. `no-non-null-assertion` is off on purpose: `!` marks array indices known to be valid. Pure logic in its own modules, views as classes, wired in `main.ts`, shared state in `AppState`.
- **TypeScript 6, not 7**: typescript-eslint doesn't support TS 7 yet, so npm resolved 6.0.3. Upgrade when it does.
- **d3 and topojson come from npm** (only the modules used: d3-geo, d3-selection, d3-zoom, d3-transition, topojson-client), bundled by esbuild, instead of the CDN. app.js is ~140 KB minified, less than the CDN files were.
- **The compiled `app.js` is not committed** (decided when moving to TS): it is built on deploy (`pages.yml`), in CI and locally (`npm run build --prefix web`). `bundle` refuses to run without it. Pre-commit runs Prettier (fixing) and tsc + ESLint + Vitest on `web/` changes.
- npm 11 blocks dependency install scripts unless listed in `allowScripts` (`web/package.json`); esbuild is approved for its exact version, so upgrading it needs `npm install-scripts approve esbuild`.

## Gotchas

- **CSS class collisions in index.html**: the map popup uses `.pop`, and `body.game-on .pop { display: none }` hides it in game mode. A game element once used class `pop` for an animation and vanished (the "reveal clue shows nothing" bug). Check existing selectors before naming classes.
- `t` is the translation function everywhere in the front end; don't shadow it with locals named `t`.
- **Headless Chrome doesn't advance d3 transitions** under `--virtual-time-budget`: the zoom buttons (animated) never reach region mode in tests. Zoom with `WheelEvent`s on the SVG instead (d3 applies wheel zoom without animation). Not a bug in the site.
- Images with fallbacks in the game don't use inline `onerror`: `GameView` listens to `error` events (capture) and uses `data-fallback`.
- `make_netlify.py`/`map/netlify` and the scripts in `map/*.py`, `scraper/*.py` no longer exist (replaced by `metal_atlas/`); old notes may mention them.
- The daily job and a local `data push` can overwrite each other: don't push data while the job runs.
- The mode buttons live in `main.ts` (`setMode`): `GameView.show` / `OracleView.show` only show or hide their view.
- **Browser caches after a deploy**: GitHub Pages serves with `max-age=600`, and an open tab keeps running the code it loaded. The owner once reported fixed questions "still failing" right after a deploy (the live site was fine). `bundle` now requests `app.js?v=<content hash>`, so a reload always gets the new code; an open tab still needs a reload. Check the live site before chasing such a report.
- `gh run watch` on a just-triggered run: wait a few seconds for it to appear.

## Checking changes

- `pre-commit run --all-files` (Python and front-end checks). Tests must not use the network (front end: fake `fetch`).
- **Refactors of the build steps**: generate outputs before and after (`regions`, `build`, `game`, `bundle`) and diff the files (`diff -rq`, `cmp`); explain every difference.
- **Front end**: Vitest covers the logic; the views need a browser. Build (`npm run build --prefix web`, `python -m metal_atlas bundle`), serve `map/public` with `python -m http.server`, inject a test script into a copy of index.html that drives the UI (click buttons, set inputs, `WheelEvent` for zoom) and writes a log into a `<pre id="__out">`, then run `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --window-size=1400,900 --virtual-time-budget=120000 --dump-dom URL` and read the log. When porting or refactoring, run the same script against the previous build and compare the logs (done for the JS -> TS port: country card links, ▶ for the three "Nevermore", band search, legend focus, region mode and card, 10 game rounds, final score).
- **Oracle**: `npm run eval --prefix web -- --backend chrome` (or `webllm`) scores the model + rules on `web/eval/questions.ts` (`--set holdout` for the held-out set) in headless Chrome over the DevTools protocol (real time, a real click for user activation). The profile `~/.cache/metal-atlas-eval` keeps the models; copying `OptGuideOnDeviceModel` from the owner's Chrome profile into it avoids the 4 GB Gemini Nano download (Chrome then registers it on the first `create()`, ~20 s). `--virtual-time-budget` can't be used for this (model promises never resolve under virtual time); the window must be ≥ 900 px wide or the Oracle is hidden.
- **Pipeline end to end**: `gh workflow run daily.yml`, then check the run log ("dataset: +N new…", "levels: […]") and the site.

## Open ideas (not requested yet)

- Filter review passages that mention lineup members.
- Recount `reviews_by_band.json` from deduplicated reviews (pages + reviews_new).
- Verify bands beyond the top 6,000 to give more map ▶ buttons real previews.
