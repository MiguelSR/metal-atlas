/** The legend: leading genres by number of countries they lead; clicking one highlights its countries. */

import { esc } from "../format";
import type { AppState } from "../state";
import { type GenreColors, OTHER_GENRE } from "./colors";

export interface LegendItem {
  key: string;
  countries: number;
  /** bands of that genre in the selection (not counted for "Other genre") */
  bands: number;
}

/** Colored genres that lead some country, most bands first, then "Other genre". */
export function legendItems(
  leading: (string | null)[],
  colored: string[],
  bandsOf: (genre: string) => number,
): LegendItem[] {
  const countries = new Map<string, number>();
  for (const key of leading) if (key) countries.set(key, (countries.get(key) ?? 0) + 1);
  const items = colored
    .filter((g) => countries.has(g))
    .map((g) => ({ key: g, countries: countries.get(g)!, bands: bandsOf(g) }))
    .sort((a, b) => b.bands - a.bands);
  if (countries.has(OTHER_GENRE)) items.push({ key: OTHER_GENRE, countries: countries.get(OTHER_GENRE)!, bands: 0 });
  return items;
}

export class Legend {
  focus: string | null = null;

  constructor(
    private readonly element: HTMLElement,
    private readonly state: AppState,
    private readonly colors: GenreColors,
    private readonly onFocus: (focus: string | null) => void,
  ) {
    element.addEventListener("click", (e) => {
      const key = (e.target as Element).closest<HTMLElement>("button[data-k]")?.dataset.k;
      if (!key) return;
      this.focus = this.focus === key ? null : key;
      this.onFocus(this.focus);
    });
  }

  render(): void {
    const { state, colors } = this;
    const t = state.t;
    const leading = [...state.countries.keys()].map((c) => colors.legendKey(state.leadingGenre(state.stats(c))));
    const items = legendItems(leading, colors.genres, (g) => state.genreTotals.get(state.genres.indexOf(g)) ?? 0);
    if (this.focus && !items.some((i) => i.key === this.focus)) this.focus = null;
    const buttons = items.map((item) => {
      const isOther = item.key === OTHER_GENRE;
      const cls = this.focus === item.key ? "on" : this.focus ? "off" : "";
      return `<button data-k="${esc(item.key)}" class="${cls}" aria-pressed="${this.focus === item.key}">
        <span class="sw" style="background:${isOther ? colors.other : colors.of(item.key)}"></span>
        <span>${esc(isOther ? t("otherGenre") : item.key)}</span>
        <span class="n">${isOther ? "" : t("legendBands", item.bands)}${t("countries", item.countries)}</span></button>`;
    });
    this.element.innerHTML =
      `<div class="t">${t("legendT")}</div>` +
      (buttons.length ? buttons.join("") : `<div class="n" style="padding:4px 0">${t("legendNone")}</div>`);
  }
}
