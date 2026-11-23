/** What the map views share: the countries, the regions loaded so far, the filters and the counts they give. */

import { type BandIndex, type CountrySummary, type RegionFile, type SiteIndex, getJson, lazy } from "./data";
import { fold } from "./format";
import type { Translate } from "./i18n";
import {
  ALL_YEARS,
  EMPTY_STATS,
  type Stats,
  type Unit,
  type YearRange,
  matchNames,
  matchStats,
  toUnit,
  unitStats,
} from "./stats";

export interface Country extends CountrySummary {
  unit: Unit;
}

export interface Regions {
  names: string[];
  units: Unit[];
  unassigned: number;
  file: RegionFile;
  stats: Stats[];
}

export interface LoadedBands extends BandIndex {
  /** folded names, for searching */
  folded: string[];
}

export class AppState {
  readonly countries = new Map<string, Country>();
  readonly genres: string[];
  readonly regions = new Map<string, Regions>();

  years: YearRange = ALL_YEARS;
  /** folded name filter ("" = none) and the text as typed */
  query = "";
  queryText = "";
  /** band positions matching the name filter */
  private matches: number[] | null = null;

  private countryStats = new Map<string, Stats>();
  /** genre -> bands in the current selection */
  genreTotals = new Map<number, number>();

  bands: LoadedBands | null = null;
  readonly loadBands = lazy(async () => {
    const index = await getJson<BandIndex>("bands.json");
    this.bands = { ...index, folded: index.n.map(fold) };
    return this.bands;
  });

  constructor(
    readonly index: SiteIndex,
    readonly t: Translate,
    readonly countryName: (country: string) => string,
    readonly nf: (n: number) => string,
  ) {
    this.genres = index.genres;
    for (const summary of index.countries) this.countries.set(summary.name, { ...summary, unit: toUnit(summary) });
    this.recompute();
  }

  get matchList(): number[] | null {
    return this.matches;
  }

  /** Applies a name filter (needs the band index loaded). Fewer than 2 characters clear it. */
  setQuery(text: string): void {
    const folded = fold(text.trim());
    if (folded.length < 2 || !this.bands) {
      this.query = "";
      this.queryText = "";
      this.matches = null;
    } else {
      this.query = folded;
      this.queryText = text.trim();
      this.matches = matchNames(this.bands.folded, folded);
    }
    this.recompute();
  }

  setYears(years: YearRange): void {
    this.years = years;
    this.recompute();
  }

  stats(country: string): Stats {
    return this.countryStats.get(country) ?? EMPTY_STATS;
  }

  /** Stats of a country (region null) or one of its regions. */
  unitStats(country: string, region: number | null): Stats {
    if (region == null) return this.stats(country);
    return this.regions.get(country)?.stats[region] ?? EMPTY_STATS;
  }

  unitName(country: string, region: number | null): string {
    return region == null ? this.countryName(country) : (this.regions.get(country)?.names[region] ?? "");
  }

  leadingGenre(stats: Stats | undefined): string | null {
    return stats?.bands && stats.genres.length ? this.genres[stats.genres[0]![0]]! : null;
  }

  async loadRegions(country: string): Promise<Regions> {
    const summary = this.countries.get(country)!;
    const file = await getJson<RegionFile>(`r/${summary.file}.json`);
    const units = file.cubes.map(toUnit);
    const regions: Regions = { names: file.regions, units, unassigned: file.unassigned, file, stats: [] };
    this.regions.set(country, regions);
    this.recompute();
    return regions;
  }

  /** Recounts every country and loaded region for the current filters. */
  recompute(): void {
    const totals = new Map<number, number>();
    if (!this.matches || !this.bands) {
      for (const [name, country] of this.countries)
        this.countryStats.set(name, unitStats(country.unit, this.years, totals));
      for (const regions of this.regions.values()) regions.stats = regions.units.map((u) => unitStats(u, this.years));
    } else {
      const counted = matchStats(this.bands, this.matches, this.years, this.index.countries.length);
      this.index.countries.forEach((c, i) => this.countryStats.set(c.name, counted.countries[i]!));
      for (const [name, regions] of this.regions) {
        const perRegion = counted.regions.get(this.countries.get(name)!.file);
        regions.stats = regions.names.map((_, r) => perRegion?.get(r) ?? EMPTY_STATS);
      }
      for (const [g, n] of counted.totals) totals.set(g, n);
    }
    this.genreTotals = totals;
  }

  yearsText(): string {
    const { lo, hi } = this.years;
    if (lo == null && hi == null) return "";
    if (lo != null && hi != null) return this.t("yrRange", lo, hi);
    return lo != null ? this.t("yrFrom", lo) : this.t("yrTo", hi!);
  }

  /** "formed 1990–1999 · name contains “x”", or "all eras". */
  selectionText(): string {
    const parts = [this.yearsText(), this.query ? this.t("nameContains", this.queryText) : ""];
    return parts.filter(Boolean).join(" · ") || this.t("allEras");
  }

  hasYearFilter(): boolean {
    return this.years.lo != null || this.years.hi != null;
  }
}
