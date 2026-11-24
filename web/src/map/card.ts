/** The card of a country or region (top genres, genre search) and of one genre there (most relevant bands). */

import { type CountryFile, getJson } from "../data";
import { bandUrl, esc, fold, highlight } from "../format";
import type { PreviewPlayer } from "../player";
import { searchUrl } from "../search-links";
import type { AppState } from "../state";
import { TOP_GENRES, inRange, searchGenres } from "../stats";
import type { GenreColors } from "./colors";
import { pageSlice, pagerHtml } from "./pager";
import type { Point } from "./world-map";

interface View {
  country: string;
  region: number | null;
  genre: number | null;
}

export class Card {
  private view: View | null = null;
  private anchor: Point | null = null;
  /** genre search text per card, kept while filters change */
  private readonly genreQueries = new Map<string, string>();
  private readonly countryFiles = new Map<string, Promise<CountryFile>>();

  constructor(
    private readonly element: HTMLElement,
    private readonly stage: HTMLElement,
    private readonly state: AppState,
    private readonly colors: GenreColors,
    private readonly player: PreviewPlayer,
    private readonly highlightOnMap: (country: string | null, region: number | null) => void,
  ) {}

  get current(): View | null {
    return this.view;
  }

  open(country: string, region: number | null, at: Point | null): void {
    this.anchor = at;
    this.showUnit(country, region);
  }

  close(): void {
    this.element.hidden = true;
    this.view = null;
    this.highlightOnMap(null, null);
  }

  /** Redraws the open card after a filter change. */
  refresh(): void {
    if (!this.view) return;
    const { country, region, genre } = this.view;
    if (genre == null) this.showUnit(country, region);
    else void this.showGenre(country, genre, region);
  }

  /** Zooming out of region mode takes a region card back to its country. */
  leaveRegions(): void {
    if (this.view?.region != null) this.showUnit(this.view.country);
  }

  private link(text: string, url: string | null): string {
    return url
      ? `<a class="ma" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(this.state.t("maSearch"))}">${text}</a>`
      : text;
  }

  private searchLink(country: string, region: number | null, genre: number | null, activeOnly: boolean): string | null {
    const state = this.state;
    return searchUrl({
      country,
      countryCode: state.countries.get(country)?.cc ?? null,
      region: region == null ? null : state.regions.get(country)?.names[region],
      genre: genre == null ? null : state.genres[genre],
      bandName: state.queryText,
      from: state.years.lo,
      to: state.years.hi,
      activeOnly,
    });
  }

  private showUnit(country: string, region: number | null = null): void {
    this.view = { country, region, genre: null };
    const { state } = this;
    const t = state.t;
    const stats = state.unitStats(country, region);
    const isRegion = region != null;
    const key = `${country}|${region}`;
    const unassigned = isRegion ? (state.regions.get(country)?.unassigned ?? 0) : 0;
    this.element.innerHTML = `
      <div class="pop-h">${isRegion ? `<button class="back" data-up>← ${esc(state.countryName(country))}</button>` : ""}
        <h2>${esc(state.unitName(country, region))}</h2><button class="close" aria-label="${t("close")}">×</button>
        <div class="meta">${isRegion ? esc(state.countryName(country)) + " · " : ""}${this.link(t("bands", stats.bands), this.searchLink(country, region, null, false))} · ${this.link(t("active", stats.active), this.searchLink(country, region, null, true))} · ${esc(state.selectionText())}</div></div>
      ${stats.bands && stats.genres.length > TOP_GENRES ? `<div class="gs"><input type="search" id="gsq" autocomplete="off" placeholder="${esc(t("genreSearchPh", state.nf(stats.genres.length)))}" aria-label="${esc(t("genreSearchAl"))}" value="${esc(this.genreQueries.get(key) ?? "")}"></div>` : ""}
      <div class="pop-b" id="glist"></div>
      <div class="foot">${t("footOverlap")}${state.hasYearFilter() ? t("filterNote") : ""}${unassigned ? t("unassigned", unassigned, esc(state.countryName(country))) : ""}</div>`;

    const list = this.element.querySelector<HTMLElement>("#glist")!;
    const top = stats.genres[0]?.[1] ?? 1;
    const row = (genre: number, bands: number, rank: number, query: string): string => {
      const name = state.genres[genre]!;
      const firstWord = query.split(/\s+/).find(Boolean) ?? "";
      const color = this.colors.has(name) ? this.colors.of(name) : "var(--muted)";
      return `<button class="g" data-g="${genre}"><span class="rk">${rank}</span><span class="nm">${highlight(name, firstWord)}<span class="go">→</span></span><span class="ct">${state.nf(bands)}</span>
        <span class="track"><span class="fill" style="width:${Math.max(1, (bands / top) * 100).toFixed(1)}%;background:${color}"></span></span></button>`;
    };
    let page = 0;
    const drawList = (): void => {
      const typed = (this.genreQueries.get(key) ?? "").trim();
      const query = fold(typed);
      if (!stats.bands) {
        list.innerHTML = `<div class="empty">${t("noBandsIn", esc(state.unitName(country, region)))}</div>`;
      } else if (!query) {
        const shown = pageSlice(page, stats.genres.length);
        page = shown.page;
        list.innerHTML =
          `<div class="eyebrow">${t("topGenres")}</div>` +
          stats.genres
            .slice(shown.start, shown.end)
            .map(([g, n], i) => row(g, n, shown.start + i + 1, ""))
            .join("") +
          this.pager(shown.start, shown.end, stats.genres.length);
        this.wirePager(list, (step) => {
          page += step;
          drawList();
        });
      } else {
        const found = searchGenres(stats.genres, state.genres, query);
        list.innerHTML = found.length
          ? `<div class="eyebrow">${t("genreMatches", found.length)}</div>` +
            found.map((m) => row(m.genre, m.bands, m.rank, query)).join("")
          : `<div class="empty">${t("genreNone", esc(typed))}</div>`;
      }
      list.querySelectorAll<HTMLElement>(".g").forEach((b) => {
        b.onclick = () => void this.showGenre(country, Number(b.dataset.g), region);
      });
    };
    drawList();

    const input = this.element.querySelector<HTMLInputElement>("#gsq");
    if (input) {
      input.oninput = () => {
        this.genreQueries.set(key, input.value);
        page = 0;
        drawList();
        this.place();
      };
      input.onkeydown = (e) => {
        if (e.key === "Enter") list.querySelector<HTMLElement>(".g")?.click();
      };
    }
    this.element.hidden = false;
    this.place();
    this.element.querySelector<HTMLElement>(".close")!.onclick = () => this.close();
    const up = this.element.querySelector<HTMLElement>("[data-up]");
    if (up) up.onclick = () => this.showUnit(country);
    this.highlightOnMap(country, region);
  }

  private countryFile(country: string): Promise<CountryFile> {
    let file = this.countryFiles.get(country);
    if (!file) {
      file = getJson<CountryFile>(`c/${this.state.countries.get(country)!.file}.json`);
      this.countryFiles.set(country, file);
    }
    return file;
  }

  private async showGenre(country: string, genre: number, region: number | null): Promise<void> {
    const view: View = { country, region, genre };
    this.view = view;
    const { state } = this;
    const t = state.t;
    const bands = state.unitStats(country, region).genres.find(([g]) => g === genre)?.[1] ?? 0;
    const where =
      region == null
        ? state.countryName(country)
        : `${state.regions.get(country)?.names[region]}, ${state.countryName(country)}`;
    const head = `<div class="pop-h"><button class="back">← ${esc(state.unitName(country, region))}</button><h2>${esc(state.genres[genre])}</h2><button class="close" aria-label="${t("close")}">×</button>
        <div class="meta">${esc(where)} · ${this.link(t("bands", bands), this.searchLink(country, region, genre, false))} · ${esc(state.selectionText())}</div></div>`;
    const wire = (): void => {
      this.element.querySelector<HTMLElement>(".back")!.onclick = () => this.showUnit(country, region);
      this.element.querySelector<HTMLElement>(".close")!.onclick = () => this.close();
    };
    this.element.innerHTML = head + `<div class="pop-b"><div class="empty">${t("loadingList")}</div></div>`;
    wire();
    this.place();

    const file = await this.countryFile(country);
    if (this.view !== view) return; // another card was opened meanwhile
    const rows = file.rows.filter(
      (r) =>
        r[7].includes(genre) &&
        inRange(r[3], state.years) &&
        (region == null || r[10].includes(region)) &&
        (!state.query || fold(r[1]).includes(state.query)),
    );
    const statusNames = t("status");
    const item = (
      [id, name, slug, year, status, labelIndex, genreText, , reviews, avg]: CountryFile["rows"][number],
      rank: number,
    ): string => {
      const label = labelIndex >= 0 ? file.labels[labelIndex] : null;
      const statusChip = status
        ? `<span class="chip ${status === 1 ? "on" : status === 3 ? "off" : ""}">${statusNames[status]}</span>`
        : "";
      return `<div class="b"><span class="rk">${rank}</span><div style="min-width:0">
          <div class="nmr"><a href="${bandUrl(id, name, slug)}" target="_blank" rel="noopener">${esc(name)}</a>${this.player.button(name, id)}</div>
          <div class="ln">${esc(genreText)}${label ? " · " + esc(label) : ""}</div>
          <div class="chips">${year ? `<span class="chip">${t("formedY", year)}</span>` : ""}${statusChip}${reviews ? `<span class="chip rv">${t("reviews", reviews, avg)}</span>` : ""}</div></div></div>`;
    };
    const draw = (page: number): void => {
      const shown = pageSlice(page, rows.length);
      const items = rows.slice(shown.start, shown.end).map((r, i) => item(r, shown.start + i + 1));
      this.element.innerHTML =
        head +
        `<div class="pop-b">${items.length ? `<div class="eyebrow">${t("topRel", rows.length)}</div>` + items.join("") + this.pager(shown.start, shown.end, rows.length) : `<div class="empty">${t("noGenreBands")}</div>`}</div>
      <div class="foot">${t("relFoot")}</div>`;
      wire();
      this.wirePager(this.element, (step) => {
        draw(shown.page + step);
        this.element.querySelector(".pop-b")?.scrollTo(0, 0);
      });
      this.place();
    };
    draw(0);
  }

  private pager(start: number, end: number, total: number): string {
    const t = this.state.t;
    return pagerHtml(
      start,
      end,
      total,
      { range: (from, to, total) => t("pageRange", from, to, total), prev: t("pagePrev"), next: t("pageNext") },
      this.state.nf,
    );
  }

  private wirePager(root: HTMLElement, go: (step: number) => void): void {
    root.querySelectorAll<HTMLButtonElement>(".pager [data-page]").forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        go(Number(b.dataset.page));
      };
    });
  }

  /** Next to where the user clicked; on phones, docked at the bottom (CSS). */
  private place(): void {
    const el = this.element;
    if (!this.anchor || window.matchMedia("(max-width: 640px)").matches) {
      el.style.left = "";
      el.style.top = "";
      return;
    }
    const width = this.stage.clientWidth;
    const height = this.stage.clientHeight;
    let x = this.anchor[0] + 18;
    let y = this.anchor[1] - 40;
    if (x + el.offsetWidth > width - 16) x = this.anchor[0] - el.offsetWidth - 18;
    x = Math.max(16, Math.min(x, width - el.offsetWidth - 16));
    y = Math.max(16, Math.min(y, height - el.offsetHeight - 16));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }
}
