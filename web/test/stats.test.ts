import { describe, expect, it } from "vitest";

import { ALL_YEARS, inRange, matchNames, matchStats, searchGenres, toUnit, unitStats } from "../src/stats";
import { BANDS } from "./fixtures";

const unit = toUnit({
  y: { "0": [2, 1], "1990": [3, 2], "2005": [1, 0] },
  g: { "0": { "0": 1, "1990": 3 }, "1": { "1990": 1, "2005": 1 }, "2": { "0": 1 } },
});

describe("stats", () => {
  it("filters years; unknown years only pass without a filter", () => {
    expect(inRange(0, ALL_YEARS)).toBe(true);
    expect(inRange(0, { lo: 1980, hi: null })).toBe(false);
    expect(inRange(1990, { lo: 1980, hi: 1995 })).toBe(true);
    expect(inRange(2000, { lo: null, hi: 1995 })).toBe(false);
  });

  it("counts a unit with and without a year filter", () => {
    const all = unitStats(unit, ALL_YEARS);
    expect([all.bands, all.active]).toEqual([6, 3]);
    expect(all.genres).toEqual([
      [0, 4],
      [1, 2],
      [2, 1],
    ]);
    const nineties = unitStats(unit, { lo: 1990, hi: 1999 });
    expect([nineties.bands, nineties.active]).toEqual([3, 2]);
    expect(nineties.genres).toEqual([
      [0, 3],
      [1, 1],
    ]);
  });

  it("adds to genre totals", () => {
    const totals = new Map<number, number>();
    unitStats(unit, ALL_YEARS, totals);
    unitStats(unit, ALL_YEARS, totals);
    expect(totals.get(0)).toBe(8);
  });

  it("matches folded names", () => {
    expect(matchNames(["machete", "black machete", "mayhem"], "machete")).toEqual([0, 1]);
  });

  it("counts matching bands by country and region", () => {
    const counted = matchStats(BANDS, [0, 1, 2], ALL_YEARS, 2);
    expect(counted.countries[0]).toEqual({
      bands: 2,
      active: 2,
      genres: [
        [0, 2],
        [1, 1],
      ],
    });
    expect(counted.countries[1]!.bands).toBe(2);
    expect(counted.regions.get(1)?.get(2)?.bands).toBe(2);
    expect(counted.totals.get(1)).toBe(2);
    expect(matchStats(BANDS, [0, 1, 2, 3], { lo: 2000, hi: null }, 2).countries[0]!.bands).toBe(1);
  });

  it("searches genres by every word, keeping the rank", () => {
    const names = ["Death Metal", "Funeral Doom Metal", "Doom Grindcore", "Sludge Metal"];
    const genres: [number, number][] = [
      [0, 500],
      [1, 230],
      [3, 40],
      [2, 1],
    ];
    expect(searchGenres(genres, names, "doom")).toEqual([
      { rank: 2, genre: 1, bands: 230 },
      { rank: 4, genre: 2, bands: 1 },
    ]);
    expect(searchGenres(genres, names, "metal doom").map((m) => m.genre)).toEqual([1]);
  });
});
