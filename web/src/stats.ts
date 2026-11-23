/** Band counts of a country or region under the current filters (formation years, band name). */

import type { BandIndex, GenreCube, YearCounts } from "./data";

/** A country or region's counts, as arrays (faster to filter than the JSON objects). */
export interface Unit {
  /** [year, bands, active] */
  years: [number, number, number][];
  /** [genre index, [[year, bands], ...]] */
  genres: [number, [number, number][]][];
}

export function toUnit(counts: { y: YearCounts; g: GenreCube }): Unit {
  return {
    years: Object.entries(counts.y).map(([y, [n, active]]) => [+y, n, active]),
    genres: Object.entries(counts.g).map(([g, ys]) => [+g, Object.entries(ys).map(([y, n]) => [+y, n])]),
  };
}

export interface YearRange {
  lo: number | null;
  hi: number | null;
}

export const ALL_YEARS: YearRange = { lo: null, hi: null };

/** Whether a formation year passes the filter; with a filter on, unknown years (0) never do. */
export function inRange(year: number, { lo, hi }: YearRange): boolean {
  if (lo == null && hi == null) return true;
  return year !== 0 && (lo == null || year >= lo) && (hi == null || year <= hi);
}

export interface Stats {
  bands: number;
  active: number;
  /** [genre index, bands], most bands first (ties: lower genre index) */
  genres: [number, number][];
}

export const TOP_GENRES = 10;
export const EMPTY_STATS: Stats = { bands: 0, active: 0, genres: [] };

const byCount = (a: [number, number], b: [number, number]): number => b[1] - a[1] || a[0] - b[0];

/** Counts of a unit for the years in range. `totals` (genre -> bands) is incremented if given. */
export function unitStats(unit: Unit, years: YearRange, totals?: Map<number, number>): Stats {
  let bands = 0;
  let active = 0;
  for (const [year, n, act] of unit.years) {
    if (inRange(year, years)) {
      bands += n;
      active += act;
    }
  }
  const genres: [number, number][] = [];
  for (const [genre, counts] of unit.genres) {
    let sum = 0;
    for (const [year, n] of counts) if (inRange(year, years)) sum += n;
    if (sum) {
      genres.push([genre, sum]);
      totals?.set(genre, (totals.get(genre) ?? 0) + sum);
    }
  }
  return { bands, active, genres: genres.sort(byCount) };
}

class Tally {
  bands = 0;
  active = 0;
  private readonly genres = new Map<number, number>();

  add(active: boolean, genres: number[]): void {
    this.bands++;
    this.active += Number(active);
    for (const g of genres) this.genres.set(g, (this.genres.get(g) ?? 0) + 1);
  }

  stats(): Stats {
    return { bands: this.bands, active: this.active, genres: [...this.genres].sort(byCount) };
  }
}

export interface MatchStats {
  /** by country index */
  countries: Stats[];
  /** country index -> region index -> stats */
  regions: Map<number, Map<number, Stats>>;
  /** genre -> bands */
  totals: Map<number, number>;
}

/** Counts built from the bands themselves (needed when filtering by name: the summaries can't tell names apart). */
export function matchStats(bands: BandIndex, matches: number[], years: YearRange, countryCount: number): MatchStats {
  const countries = Array.from({ length: countryCount }, () => new Tally());
  const regions = new Map<number, Map<number, Tally>>();
  const totals = new Map<number, number>();
  for (const i of matches) {
    if (!inRange(bands.y[i]!, years)) continue;
    const active = bands.a.charCodeAt(i) === 49; // "1"
    const genres = bands.g[i]!;
    for (const g of genres) totals.set(g, (totals.get(g) ?? 0) + 1);
    for (const [country, ...regionList] of bands.l[i]!) {
      countries[country!]!.add(active, genres);
      if (!regionList.length) continue;
      let perRegion = regions.get(country!);
      if (!perRegion) regions.set(country!, (perRegion = new Map<number, Tally>()));
      for (const r of regionList) {
        let tally = perRegion.get(r);
        if (!tally) perRegion.set(r, (tally = new Tally()));
        tally.add(active, genres);
      }
    }
  }
  const regionStats = new Map<number, Map<number, Stats>>();
  for (const [country, perRegion] of regions) {
    const stats = new Map<number, Stats>();
    for (const [region, tally] of perRegion) stats.set(region, tally.stats());
    regionStats.set(country, stats);
  }
  return { countries: countries.map((t) => t.stats()), regions: regionStats, totals };
}

/** Indices of the bands whose folded name contains the folded query. */
export function matchNames(foldedNames: string[], query: string): number[] {
  const out: number[] = [];
  foldedNames.forEach((name, i) => {
    if (name.includes(query)) out.push(i);
  });
  return out;
}

/** Genres whose name contains every word of the query, keeping the given order (most bands first). */
export function searchGenres(
  genres: [number, number][],
  names: string[],
  foldedQuery: string,
  limit = 60,
): { rank: number; genre: number; bands: number }[] {
  const words = foldedQuery.split(/\s+/).filter(Boolean);
  const out: { rank: number; genre: number; bands: number }[] = [];
  genres.forEach(([genre, bands], i) => {
    const name = names[genre]!.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (words.every((w) => name.includes(w))) out.push({ rank: i + 1, genre, bands });
  });
  return out.slice(0, limit);
}
