/** Pure parts of the views: clue HTML, legend items, search links, year parsing, country names, lazy loading. */

import { describe, expect, it, vi } from "vitest";

import { atlasName, countryNamer } from "../src/countries";
import { lazy } from "../src/data";
import { clueHtml } from "../src/game/clues";
import { Clue } from "../src/game/rules";
import { translator } from "../src/i18n";
import { parseYear, yearRange } from "../src/map/controls";
import { OTHER_GENRE } from "../src/map/colors";
import { legendItems } from "../src/map/legend";
import { searchUrl } from "../src/search-links";
import { gameBand } from "./fixtures";

const t = translator("en", String);

describe("clues", () => {
  const ctx = { band: gameBand(), album: "Nevermore", masked: true, t };

  it("hides the band's name until the round ends", () => {
    expect(clueHtml(Clue.Review, ctx)).toContain("▒▒▒ at their best");
    expect(clueHtml(Clue.Review, { ...ctx, masked: false })).toContain("Nevermore at their best");
    expect(clueHtml(Clue.Album, ctx)).toBe("<i>▒▒▒ (self-titled)</i>");
  });

  it("shows city and country, the lineup and its era", () => {
    expect(clueHtml(Clue.Origin, ctx)).toBe("Seattle, Washington <small>· United States</small>");
    expect(clueHtml(Clue.Origin, { ...ctx, band: gameBand({ 14: null }) })).toBe("United States");
    const lineup = clueHtml(Clue.Lineup, ctx);
    expect(lineup).toContain("Warrel Dane <small>· Vocals</small></span><br>");
    expect(lineup).toContain("(last known)");
    expect(clueHtml(Clue.Lineup, ctx, true)).not.toContain("<br><span");
  });

  it("escapes data", () => {
    expect(clueHtml(Clue.Origin, { ...ctx, band: gameBand({ 14: "<script>" }) })).toContain("&lt;script&gt;");
  });
});

describe("legend", () => {
  it("lists colored genres by bands, then Other genre", () => {
    const leading = ["Death Metal", "Black Metal", "Black Metal", OTHER_GENRE, null];
    const bands = (g: string): number => ({ "Death Metal": 10, "Black Metal": 5 })[g] ?? 0;
    expect(legendItems(leading, ["Black Metal", "Death Metal", "Heavy Metal"], bands)).toEqual([
      { key: "Death Metal", countries: 1, bands: 10 },
      { key: "Black Metal", countries: 2, bands: 5 },
      { key: OTHER_GENRE, countries: 1, bands: 0 },
    ]);
  });
});

describe("Metal Archives search links", () => {
  it("carry the map's filters", () => {
    const url = searchUrl({ country: "Spain", countryCode: "ES", genre: "Heavy Metal", from: 1990, activeOnly: true });
    expect(url).toBe(
      "https://www.metal-archives.com/search/advanced/searching/bands?bandName=&genre=Heavy+Metal&country%5B%5D=ES&location=&yearCreationFrom=1990&yearCreationTo=&status%5B%5D=1",
    );
  });

  it("translate grouped regions and skip statistical ones", () => {
    expect(searchUrl({ country: "Spain", countryCode: "ES", region: "Cataluña" })).toContain("location=Catalonia");
    expect(searchUrl({ country: "Philippines", countryCode: "PH", region: "Davao (Region XI)" })).toContain(
      "location=Davao&",
    );
    expect(searchUrl({ country: "United Kingdom", countryCode: "GB", region: "North West" })).toBeNull();
    expect(searchUrl({ country: "Nowhere", countryCode: null })).toBeNull();
  });
});

describe("year filter", () => {
  it("parses plausible years and swaps reversed ranges", () => {
    expect(parseYear("1984")).toBe(1984);
    expect(parseYear("84")).toBeNull();
    expect(yearRange("1999", "1990")).toEqual({ lo: 1990, hi: 1999 });
    expect(yearRange("", "1979")).toEqual({ lo: null, hi: 1979 });
  });
});

describe("country names", () => {
  it("maps to the world atlas and translates", () => {
    expect(atlasName("United States")).toBe("United States of America");
    const es = countryNamer("es", "Internacional");
    expect(es("Germany")).toBe("Alemania");
    expect(es("Korea, South")).toBe("Corea del Sur");
    expect(es("International")).toBe("Internacional");
    expect(countryNamer("en", "International")("Korea, South")).toBe("South Korea");
  });
});

describe("lazy", () => {
  it("loads once, and again after a failure", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(42);
    const get = lazy(load);
    await expect(get()).rejects.toThrow("offline");
    expect(await get()).toBe(42);
    expect(await get()).toBe(42);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
