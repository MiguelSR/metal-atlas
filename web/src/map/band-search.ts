/** The band search: matching names (most relevant first) in a panel, and the name filter applied to the map. */

import { bandUrl, esc, highlight } from "../format";
import type { PreviewPlayer } from "../player";
import type { AppState } from "../state";
import { inRange } from "../stats";

const MAX_RESULTS = 200;
const DEBOUNCE_MS = 300;

export class BandSearch {
  private sequence = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly input: HTMLInputElement,
    private readonly panel: HTMLElement,
    private readonly state: AppState,
    private readonly player: PreviewPlayer,
    /** after the filter changed: recount and redraw the map */
    private readonly onFilter: () => void,
    private readonly openCountry: (country: string) => void,
  ) {
    input.addEventListener("input", () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.apply(), DEBOUNCE_MS);
    });
    panel.addEventListener("click", (e) => {
      const target = e.target as Element;
      if (target.closest(".close")) {
        input.value = "";
        void this.apply();
        return;
      }
      const country = target.closest<HTMLElement>(".cbtn")?.dataset.c;
      if (country && state.stats(country).bands) openCountry(country);
    });
  }

  async apply(): Promise<void> {
    const text = this.input.value.trim();
    const mine = ++this.sequence;
    if (text.length >= 2 && !this.state.bands) {
      this.panel.innerHTML = `<div class="more">${this.state.t("loadingIndex")}</div>`;
      this.panel.hidden = false;
      await this.state.loadBands();
      if (mine !== this.sequence) return; // a newer search superseded this one
    }
    this.state.setQuery(text);
    this.onFilter();
  }

  render(): void {
    const { state, panel } = this;
    const bands = state.bands;
    const matches = state.matchList;
    if (!state.query || !bands || !matches) {
      panel.hidden = true;
      return;
    }
    const t = state.t;
    const list = matches.filter((i) => inRange(bands.y[i]!, state.years));
    const items = list.slice(0, MAX_RESULTS).map((i) => {
      const countries = bands.l[i]!.map(([c]) => state.index.countries[c!]!.name);
      const genres = bands.g[i]!.slice(0, 2)
        .map((g) => state.genres[g])
        .join(", ");
      const year = bands.y[i];
      return `<li><div class="nmr"><a href="${bandUrl(bands.id[i]!, bands.n[i]!, bands.s[i])}" target="_blank" rel="noopener">${highlight(bands.n[i]!, state.query)}</a>${this.player.button(bands.n[i]!, bands.id[i]!)}</div>
        <div class="ln">${countries.map((c) => `<button class="cbtn" data-c="${esc(c)}">${esc(state.countryName(c))}</button>`).join(" / ")}${year ? ` · ${year}` : ""}${genres ? ` · ${esc(genres)}` : ""}</div></li>`;
    });
    panel.innerHTML =
      `<div class="rh"><b>${t("matchingHead", list.length, esc(state.queryText))}</b>
        <button class="close" aria-label="${t("clearSearch")}">×</button>
        <div class="meta">${esc(state.yearsText() || t("allEras"))} · ${t("sorted")}</div></div>` +
      (list.length
        ? `<ol>${items.join("")}</ol>${list.length > MAX_RESULTS ? `<div class="more">${t("showingMax", MAX_RESULTS)}</div>` : ""}`
        : `<div class="more">${t("noNames", state.yearsText())}</div>`);
    panel.hidden = false;
  }
}
