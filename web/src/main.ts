/** Entry point: loads the data and wires the map, its panels, the preview player and the game. */

import type { GeometryCollection, Topology } from "topojson-specification";

import { countryNamer } from "./countries";
import { type SiteIndex, getJson } from "./data";
import { numberFormatter } from "./format";
import { GameView } from "./game/game-view";
import { detectLang, savedLang, translator } from "./i18n";
import { BandSearch } from "./map/band-search";
import { Card } from "./map/card";
import { GenreColors } from "./map/colors";
import { bindCountryFinder, bindYearFilter, translatePage } from "./map/controls";
import { Legend } from "./map/legend";
import { WorldMap } from "./map/world-map";
import { PreviewPlayer } from "./player";
import { AppState } from "./state";

const $ = (id: string): HTMLElement => document.getElementById(id)!;

async function main(): Promise<void> {
  const lang = detectLang(savedLang(), navigator.languages.length ? navigator.languages : [navigator.language || "en"]);
  const nf = numberFormatter(lang);
  const t = translator(lang, nf);
  translatePage(t, lang);

  const [index, topology] = await Promise.all([
    getJson<SiteIndex>("index.json"),
    getJson<Topology<{ countries: GeometryCollection<{ name: string }> }>>("countries-50m.json"),
  ]);
  $("loading").remove();

  const state = new AppState(index, t, countryNamer(lang, t("intl")), nf);
  const colors = GenreColors.fromDocument();
  const stage = $("stage");
  const player = new PreviewPlayer($("np"), t);

  // the views refer to each other through callbacks, which only run after everything is built
  const map = new WorldMap($("map") as unknown as SVGSVGElement, stage, $("tip"), topology, state, colors, {
    select: (country, region, at) => card.open(country, region, at),
    background: () => card.close(),
    regionalChanged: (regional) => {
      paintSubtitle();
      if (!regional) card.leaveRegions();
    },
  });
  const card = new Card($("pop"), stage, state, colors, player, (c, r) => map.highlight(c, r));
  const legend = new Legend($("legend"), state, colors, (focus) => {
    map.focus = focus;
    paint();
  });
  const openCountry = (country: string): void => card.open(country, null, map.anchorOf(country));
  const search = new BandSearch(
    $("bq") as HTMLInputElement,
    $("results"),
    state,
    player,
    () => filtersChanged(),
    openCountry,
  );

  function paintSubtitle(): void {
    let total = 0;
    for (const c of index.countries)
      if (c.name !== "International" && c.name !== "Unknown") total += state.stats(c.name).bands;
    const selection = [state.yearsText(), state.query ? t("matching", state.queryText) : ""].filter(Boolean).join(", ");
    $("sub").textContent =
      `${t("bands", total)}${selection ? " " + selection : ""} · ` + (map.regional ? t("subRegion") : t("subHint"));
  }
  function paint(): void {
    legend.render();
    map.focus = legend.focus;
    map.paint();
    paintSubtitle();
  }
  function filtersChanged(): void {
    paint();
    card.refresh();
    search.render();
  }

  bindYearFilter((years) => {
    state.setYears(years);
    filtersChanged();
  });
  bindCountryFinder([...state.countries.keys()], state.countryName, openCountry);
  $("zin").onclick = () => map.zoomBy(1.8);
  $("zout").onclick = () => map.zoomBy(1 / 1.8);
  $("zreset").onclick = () => map.resetZoom();
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") card.close();
  });

  new GameView($("game"), $("mode"), state, () => {
    player.stop();
    card.close();
  });
  paint();
}

void main();
