/** The Oracle's data (oracle.json, built by `python -m metal_atlas oracle`) and lookups over it. */

import { localCountryNames } from "../countries";
import { fold } from "../format";
import type { Vocabulary } from "./refine";

export type Lineup = [header: string, members: [name: string, role: string][]];
export type Album = [id: number, title: string, type: string, year: number | null];

export interface OracleFile {
  v: number;
  genres: string[];
  countries: string[];
  dicts: { genre: string[]; location: string[]; themes: string[]; label: string[] };
  id: number[];
  name: string[];
  slug: Record<string, string>;
  year: number[];
  status: number[];
  genre: number[];
  g: number[][];
  country: number[][];
  location: number[];
  themes: number[];
  label: number[];
  reviews: number[];
  rating: number[];
  lineups: Record<string, Lineup>;
  albums: Record<string, Album[]>;
}

/** Other ways of naming Metal Archives countries (folded). */
const COUNTRY_ALIASES: Record<string, string> = {
  usa: "United States",
  us: "United States",
  "u.s.a.": "United States",
  america: "United States",
  eeuu: "United States",
  "ee.uu.": "United States",
  "ee. uu.": "United States",
  "estados unidos": "United States",
  "united states of america": "United States",
  uk: "United Kingdom",
  "great britain": "United Kingdom",
  britain: "United Kingdom",
  "reino unido": "United Kingdom",
  "gran bretana": "United Kingdom",
  holland: "Netherlands",
  holanda: "Netherlands",
  "south korea": "Korea, South",
  korea: "Korea, South",
  "corea del sur": "Korea, South",
  corea: "Korea, South",
  turkey: "Türkiye",
  turquia: "Türkiye",
  "czech republic": "Czechia",
  "republica checa": "Czechia",
};

/** Row-oriented access and the lookups the engine needs, built once from the file. */
export class OracleIndex implements Vocabulary {
  readonly size: number;
  private bandNames: Set<string> | null = null;
  private labelNames: Set<string> | null = null;
  private readonly countryByName = new Map<string, number>();
  private readonly foldedNames: string[];
  private readonly folded = new Map<keyof OracleFile["dicts"], string[]>();

  constructor(readonly data: OracleFile) {
    this.size = data.id.length;
    this.foldedNames = data.name.map(fold);
    const spanish = localCountryNames("es");
    data.countries.forEach((name, i) => {
      this.countryByName.set(fold(name), i);
      const local = spanish[name];
      if (local) this.countryByName.set(fold(local), i);
    });
    for (const [alias, name] of Object.entries(COUNTRY_ALIASES)) {
      const i = this.countryByName.get(fold(name));
      if (i !== undefined) this.countryByName.set(alias, i);
    }
  }

  /** Index of a country named in English, Spanish or a common alias; null if unknown. */
  countryIndex(name: string): number | null {
    return this.countryByName.get(fold(name).replace(/^the /, "")) ?? null;
  }

  /** The Metal Archives name of a country (see `countryIndex`), or null. */
  country(name: string): string | null {
    const i = this.countryIndex(name);
    return i === null ? null : this.data.countries[i]!;
  }

  isBand(name: string): boolean {
    this.bandNames ??= new Set(this.foldedNames);
    return this.bandNames.has(name);
  }

  /** A label's name, also without its usual suffix ("Century Media" for "Century Media Records"). */
  isLabel(name: string): boolean {
    this.labelNames ??= new Set(this.foldedDict("label"));
    return ["", " records", " productions", " music", " recordings"].some((suffix) =>
      this.labelNames!.has(name + suffix),
    );
  }

  /** Folded name of a row. */
  nameOf(row: number): string {
    return this.foldedNames[row]!;
  }

  /** The folded values of a dictionary, computed on first use. */
  foldedDict(dict: keyof OracleFile["dicts"]): string[] {
    let values = this.folded.get(dict);
    if (!values) {
      values = this.data.dicts[dict].map(fold);
      this.folded.set(dict, values);
    }
    return values;
  }

  /** Which entries of a dictionary contain all the words (folded); used to filter rows by dictionary index. */
  dictMatches(dict: keyof OracleFile["dicts"], words: string[]): Uint8Array {
    const needles = words.map(fold);
    const values = this.foldedDict(dict);
    const hits = new Uint8Array(values.length);
    values.forEach((value, i) => {
      if (needles.every((needle) => value.includes(needle))) hits[i] = 1;
    });
    return hits;
  }

  /**
   * Which lyrical themes contain one of the stems (regular expression sources, matched at the start of a word; a
   * trailing "$" ends the word), not counting "anti-" ones ("christian" is not "anti-christian").
   */
  themeMatches(stems: string[]): Uint8Array {
    const alternatives = stems.map((stem) => {
      const source = stem.replace(/\$$/, "\\b");
      return source.startsWith("anti") ? `\\b${source}` : `(?<!anti[- ]?)\\b${source}`;
    });
    const pattern = new RegExp(alternatives.join("|"));
    const values = this.foldedDict("themes");
    const hits = new Uint8Array(values.length);
    values.forEach((value, i) => {
      if (pattern.test(value)) hits[i] = 1;
    });
    return hits;
  }

  lineup(row: number): Lineup | undefined {
    return this.data.lineups[row];
  }

  albums(row: number): Album[] | undefined {
    return this.data.albums[row];
  }

  /** The dictionary value of a row's field, or "" when missing. */
  text(dict: keyof OracleFile["dicts"], row: number): string {
    const i = this.data[dict][row]!;
    return i < 0 ? "" : this.data.dicts[dict][i]!;
  }
}
