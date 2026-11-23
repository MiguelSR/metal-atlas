/** Shapes of the JSON files built by the Python package (see README, "Data formats"), and lazy loaders. */

import type { FeatureCollection, MultiLineString } from "geojson";

/** year -> [bands, active bands]; year "0" = unknown */
export type YearCounts = Record<string, [number, number]>;
/** genre index -> year -> bands */
export type GenreCube = Record<string, Record<string, number>>;

export interface CountrySummary {
  name: string;
  /** number of its c/<file>.json and r/<file>.json */
  file: number;
  /** has region data */
  r: boolean;
  /** Metal Archives country code */
  cc: string | null;
  y: YearCounts;
  g: GenreCube;
}

export interface SiteIndex {
  genres: string[];
  countries: CountrySummary[];
}

/** Every band, most relevant first, as parallel columns. */
export interface BandIndex {
  n: string[];
  y: number[];
  /** "1" active, "0" not, one character per band */
  a: string;
  g: number[][];
  /** [[country index, ...region indices], ...] */
  l: number[][][];
  id: number[];
  /** non-default URL slugs by band position */
  s: Record<string, string>;
}

/** [id, name, slug|0, year, status, label index|-1, genre, genre indices, reviews, avg rating, regions] */
export type CountryRow = [
  number,
  string,
  string | 0,
  number,
  number,
  number,
  string,
  number[],
  number,
  number,
  number[],
];

export interface CountryFile {
  labels: string[];
  rows: CountryRow[];
}

export interface RegionFile {
  regions: string[];
  fills: FeatureCollection;
  borders: MultiLineString;
  cubes: { y: YearCounts; g: GenreCube }[];
  unassigned: number;
}

/** [preview URL, song, album, cover] with the common URL prefixes stripped */
export type ShortTrack = [string, string, string, string | null];

/** One game band; see metal_atlas/game.py. */
export type GameRow = [
  id: number,
  name: string,
  slug: string | 0,
  year: number,
  countries: string,
  members: [string, string][],
  lineupHeader: string,
  photo: string | null,
  review: string | null,
  reviewRating: number | null,
  logo: string | null,
  itunesArtist: number | null,
  albums: string[],
  tracks: ShortTrack[],
  location: string | null,
];

export interface GameData {
  levels: number[][];
  b: GameRow[];
}

export interface PreviewsFile {
  t: Record<string, ShortTrack[]>;
  none: number[];
  taken: number[];
}

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

/** A loader that fetches once and shares the promise; a failed load can be retried. */
export function lazy<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () =>
    (pending ??= load().catch((error: unknown) => {
      pending = null;
      throw error;
    }));
}
