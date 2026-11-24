/** Answers a query on the Oracle's data. Pure: no model, no DOM. */

import { fold } from "../format";
import type { Album, OracleIndex } from "./data";
import { type Missing, type Query, STATUSES } from "./query";
import { themeStems } from "./themes";

export interface AlbumHit {
  row: number;
  album: Album;
}

export interface LineupHit {
  row: number;
  header: string;
  /** the members that match the member and role filters */
  members: [string, string][];
  /** the whole lineup, shown when no member matches */
  all: [string, string][];
}

export type Answer =
  | { kind: "bands"; total: number; rows: number[] }
  | { kind: "count"; total: number; rows: number[] }
  | { kind: "top"; total: number; groups: { key: string; count: number }[] }
  | { kind: "albums"; total: number; albums: AlbumHit[]; bandsWithoutData: number }
  | { kind: "lineup"; lineups: LineupHit[]; bandsWithoutData: number }
  | { kind: "unsupported"; missing: Missing };

/** Something the engine changed or couldn't use from the query, to show next to the answer. */
export interface Note {
  kind: "countryAsLocation";
  value: string;
}

export interface Result {
  answer: Answer;
  notes: Note[];
}

const DEFAULT_LIMIT = 10;
const SAMPLE = 5;
const MAX_LINEUPS = 5;
/** ratings are compared only among bands with enough reviews */
const MIN_RATED_REVIEWS = 3;

/** Spanish (and other) instrument words -> the English Metal Archives uses in roles. */
const ROLE_WORDS: Record<string, string> = {
  guitarra: "guitar",
  guitarrista: "guitar",
  guitarist: "guitar",
  bajo: "bass",
  bajista: "bass",
  bassist: "bass",
  bateria: "drum",
  baterista: "drum",
  drummer: "drum",
  voz: "vocal",
  vocalista: "vocal",
  cantante: "vocal",
  singer: "vocal",
  voice: "vocal",
  teclado: "keyboard",
  teclados: "keyboard",
  teclista: "keyboard",
  keyboardist: "keyboard",
};

/** A role word reduced to what appears in Metal Archives roles ("Guitars" -> "guitar", "batería" -> "drum"). */
export function roleNeedle(role: string): string {
  const word = fold(role).trim();
  return ROLE_WORDS[word] ?? word.replace(/s$/, "");
}

/**
 * Genres that don't make a band "mixed" for a given one (owner, 2026-11-24: Heavy/Doom and Doom Rock are pure doom,
 * so Black Sabbath counts). The row must still have the asked genre: the genre-word filter runs first.
 */
const KINDRED: Record<string, string[]> = { doom: ["heavy", "rock"] };

/** Words that name a genre family: a genre that has one besides the asked one is a mix, not pure. */
const GENRE_FAMILIES = new Set(
  (
    "death black thrash doom heavy power speed folk gothic sludge stoner grindcore grind groove symphonic industrial " +
    "metalcore deathcore hardcore crust punk progressive rock ambient drone noise electronic electronica pop jazz " +
    "blackened deathened viking pagan crossover nu post djent shoegaze mathcore goregrind powerviolence avant garde " +
    "experimental neofolk darkwave synth dungeon fusion blues grunge alternative rap hip hop trap psychedelic"
  ).split(" "),
);

const decade = (year: number): string => `${Math.floor(year / 10) * 10}s`;

export class OracleEngine {
  constructor(private readonly index: OracleIndex) {}

  run(query: Query): Result {
    const notes: Note[] = [];
    if (query.intent === "unsupported") {
      return { answer: { kind: "unsupported", missing: query.missing ?? "other" }, notes };
    }
    const rows = this.matchingRows(query, notes);
    return { answer: this.answer(query, rows), notes };
  }

  private answer(query: Query, rows: number[]): Answer {
    const limit = query.limit ?? DEFAULT_LIMIT;
    switch (query.intent) {
      case "count":
        return { kind: "count", total: rows.length, rows: this.sorted(rows, query).slice(0, SAMPLE) };
      case "top":
        return { kind: "top", total: rows.length, groups: this.groups(rows, query).slice(0, limit) };
      case "albums":
        return this.albums(query, rows);
      case "lineup":
        return this.lineups(query, rows);
      default: {
        // some sorts leave bands out (no year, no reviews): the total counts what is listed
        const sorted = this.sorted(rows, query);
        return { kind: "bands", total: sorted.length, rows: sorted.slice(0, limit) };
      }
    }
  }

  // ---------- filtering ----------

  /** Rows (in relevance order) that pass every filter of the query. */
  matchingRows(query: Query, notes: Note[] = []): number[] {
    const { data } = this.index;
    const tests: ((row: number) => boolean)[] = [];
    const inDict = (dict: "genre" | "location" | "themes" | "label", words: string[]): void => {
      const hits = this.index.dictMatches(dict, words);
      const column = data[dict];
      tests.push((row) => hits[column[row]!] === 1);
    };

    if (query.band) {
      const name = fold(query.band);
      const exact = this.bandRows(name);
      const set = new Set(exact);
      tests.push((row) => set.has(row));
    }
    if (query.genre) inDict("genre", query.genre);
    if (query.genre && query.pureGenre) {
      const pure = this.pureGenres(query.genre);
      tests.push((row) => data.g[row]!.length > 0 && data.g[row]!.every((g) => pure[g] === 1));
    }
    if (query.country) {
      const country = this.index.countryIndex(query.country);
      if (country === null) {
        // a region or state named as a country ("Scotland", "Texas"): search it in the locations
        notes.push({ kind: "countryAsLocation", value: query.country });
        inDict("location", [query.country]);
      } else tests.push((row) => data.country[row]!.includes(country));
    }
    if (query.location) inDict("location", [query.location]);
    if (query.themes) {
      // every theme (concept) must appear; each one through any of its stems
      const hits = query.themes.map((theme) => this.index.themeMatches(themeStems(theme)));
      const column = data.themes;
      tests.push((row) => hits.every((h) => h[column[row]!] === 1));
    }
    if (query.label) inDict("label", [query.label]);
    if (query.unsigned) tests.push((row) => data.label[row] === -1);
    if (query.reviewsMin !== undefined || query.reviewsMax !== undefined) {
      const min = query.reviewsMin ?? 0;
      const max = query.reviewsMax ?? Infinity;
      tests.push((row) => data.reviews[row]! >= min && data.reviews[row]! <= max);
    }
    if (query.ratingMin !== undefined || query.ratingMax !== undefined) {
      const min = query.ratingMin ?? 0;
      const max = query.ratingMax ?? 100;
      tests.push((row) => data.reviews[row]! > 0 && data.rating[row]! >= min && data.rating[row]! <= max);
    }
    if (query.name) {
      const name = fold(query.name);
      const how = query.nameMatch ?? "exact";
      tests.push((row) => {
        const candidate = this.index.nameOf(row);
        if (how === "prefix") return candidate.startsWith(name);
        if (how === "contains") return candidate.includes(name);
        if (how === "suffix") return candidate.endsWith(name);
        return candidate === name;
      });
    }
    if (query.status) {
      const code = STATUSES.indexOf(query.status) + 1;
      tests.push((row) => data.status[row] === code);
    }
    if (query.formedFrom !== undefined || query.formedTo !== undefined) {
      const from = query.formedFrom ?? 0;
      const to = query.formedTo ?? 9999;
      tests.push((row) => {
        const year = data.year[row]!;
        return year > 0 && year >= from && year <= to;
      });
    }
    if (query.member || (query.role && query.intent !== "lineup")) {
      tests.push((row) => this.membersOf(row, query).length > 0);
    }
    if (query.intent !== "albums" && (query.album || query.albumType || query.releasedFrom || query.releasedTo)) {
      tests.push((row) => this.albumsOf(row, query).length > 0);
    }

    const rows: number[] = [];
    for (let row = 0; row < this.index.size; row++) if (tests.every((test) => test(row))) rows.push(row);
    return rows;
  }

  /**
   * Which normalized genres are purely the asked genre: they contain every word and no other genre family
   * ("Epic Doom Metal", "Funeral Doom", and with KINDRED "Heavy/Doom" and "Doom Rock" are pure doom; "Blackened Doom",
   * "Drone Doom" and "Doom/Death" are not).
   */
  private pureGenres(words: string[]): Uint8Array {
    const asked = words.map(fold);
    const names = this.index.data.genres;
    const pure = new Uint8Array(names.length);
    names.forEach((name, i) => {
      const parts = fold(name)
        .replace(/[()]/g, " ")
        .split(/[\s/,-]+/)
        .filter(Boolean);
      const tolerated = asked.flatMap((word) => KINDRED[word] ?? []);
      const isAsked = (part: string): boolean => asked.some((word) => part.startsWith(word));
      const hasAll = asked.every((word) => parts.some((part) => part.startsWith(word)));
      const other = parts.some((part) => GENRE_FAMILIES.has(part) && !isAsked(part) && !tolerated.includes(part));
      // the genre itself ("Epic Doom Metal", "Doom Rock"), or a kindred one beside it ("Heavy Metal" in Heavy/Doom)
      const kindred = parts.some((part) => tolerated.includes(part));
      if ((hasAll || kindred) && !other) pure[i] = 1;
    });
    return pure;
  }

  /** Rows named exactly `name` (folded); if none, names starting with it. */
  private bandRows(name: string): number[] {
    const exact: number[] = [];
    const prefix: number[] = [];
    for (let row = 0; row < this.index.size; row++) {
      const candidate = this.index.nameOf(row);
      if (candidate === name) exact.push(row);
      else if (!exact.length && candidate.startsWith(name)) prefix.push(row);
    }
    return exact.length ? exact : prefix;
  }

  private membersOf(row: number, query: Query): [string, string][] {
    const lineup = this.index.lineup(row);
    if (!lineup) return [];
    const member = query.member ? fold(query.member) : null;
    const role = query.role ? roleNeedle(query.role) : null;
    return lineup[1].filter(
      ([name, roles]) => (!member || fold(name).includes(member)) && (!role || fold(roles).includes(role)),
    );
  }

  private albumsOf(row: number, query: Query): Album[] {
    const title = query.album ? fold(query.album) : null;
    return (this.index.albums(row) ?? []).filter(([, name, type, year]) => {
      if (title && !fold(name).includes(title)) return false;
      if (query.albumType && type !== query.albumType) return false;
      if (query.releasedFrom && (!year || year < query.releasedFrom)) return false;
      if (query.releasedTo && (!year || year > query.releasedTo)) return false;
      return true;
    });
  }

  // ---------- answers ----------

  private sorted(rows: number[], query: Query): number[] {
    const { year, reviews, rating } = this.index.data;
    switch (query.sort) {
      case "reviews":
        return [...rows].sort((a, b) => reviews[b]! - reviews[a]! || a - b);
      case "rating":
        return rows
          .filter((row) => reviews[row]! >= MIN_RATED_REVIEWS)
          .sort((a, b) => rating[b]! - rating[a]! || reviews[b]! - reviews[a]!);
      case "lowestRating":
        return rows
          .filter((row) => reviews[row]! >= MIN_RATED_REVIEWS)
          .sort((a, b) => rating[a]! - rating[b]! || reviews[b]! - reviews[a]!);
      case "fewestReviews":
        // among bands with reviews: most bands have none, which says nothing
        return rows.filter((row) => reviews[row]! > 0).sort((a, b) => reviews[a]! - reviews[b]! || a - b);
      case "oldest":
        return rows.filter((row) => year[row]! > 0).sort((a, b) => year[a]! - year[b]! || a - b);
      case "newest":
        return rows.filter((row) => year[row]! > 0).sort((a, b) => year[b]! - year[a]! || a - b);
      default:
        return rows; // relevance = row order
    }
  }

  private groups(rows: number[], query: Query): { key: string; count: number }[] {
    const { data } = this.index;
    const counts = new Map<string, number>();
    const shown = new Map<string, string>();
    const add = (key: string): void => {
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    };
    for (const row of rows) {
      switch (query.groupBy) {
        case "country":
          for (const c of data.country[row]!) add(data.countries[c]!);
          break;
        case "genre":
          for (const g of data.g[row]!) add(data.genres[g]!);
          break;
        case "label":
          add(this.index.text("label", row));
          break;
        case "location":
          add(this.index.text("location", row));
          break;
        case "theme":
          // one count per term, case-insensitive ("Death" and "death" together), shown as first written
          for (const term of this.index.themeTerms(row)) {
            const key = fold(term);
            if (!shown.has(key)) shown.set(key, term.charAt(0).toUpperCase() + term.slice(1));
            add(shown.get(key)!);
          }
          break;
        case "year":
          if (data.year[row]) add(String(data.year[row]));
          break;
        case "decade":
          if (data.year[row]) add(decade(data.year[row]));
          break;
        default:
          add(STATUSES[data.status[row]! - 1] ?? "");
      }
    }
    const byYear = query.groupBy === "year" || query.groupBy === "decade";
    return [...counts]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => (byYear && query.sort === "oldest" ? a.key.localeCompare(b.key) : b.count - a.count));
  }

  private albums(query: Query, rows: number[]): Answer {
    const hits: AlbumHit[] = [];
    let bandsWithoutData = 0;
    for (const row of rows) {
      if (!this.index.albums(row)) {
        bandsWithoutData++;
        continue;
      }
      for (const album of this.albumsOf(row, query)) hits.push({ row, album });
    }
    const yearOf = (hit: AlbumHit): number => hit.album[3] ?? 9999;
    if (query.sort === "newest") hits.sort((a, b) => yearOf(b) - yearOf(a) || a.row - b.row);
    else if (query.sort !== "relevance") hits.sort((a, b) => yearOf(a) - yearOf(b) || a.row - b.row);
    const limit = query.limit ?? (query.band ? 40 : DEFAULT_LIMIT);
    return { kind: "albums", total: hits.length, albums: hits.slice(0, limit), bandsWithoutData };
  }

  private lineups(query: Query, rows: number[]): Answer {
    const lineups: LineupHit[] = [];
    let bandsWithoutData = 0;
    for (const row of rows) {
      const lineup = this.index.lineup(row);
      if (!lineup) {
        bandsWithoutData++;
        continue;
      }
      if (lineups.length < MAX_LINEUPS) {
        lineups.push({ row, header: lineup[0], members: this.membersOf(row, query), all: lineup[1] });
      }
    }
    return { kind: "lineup", lineups, bandsWithoutData };
  }
}
