/**
 * The Oracle's query language: what the language model produces from a question, as JSON. The model only translates;
 * the engine (engine.ts) answers. `parseQuery` accepts whatever the model wrote and keeps only what is valid.
 */

export const INTENTS = ["bands", "count", "top", "albums", "lineup", "unsupported"] as const;
export const GROUPS = ["country", "genre", "label", "year", "decade", "location", "status", "theme"] as const;
export const SORTS = ["relevance", "reviews", "rating", "oldest", "newest", "fewestReviews", "lowestRating"] as const;
export const STATUSES = ["Active", "On hold", "Split-up", "Unknown", "Changed name", "Disputed"] as const;
export const ALBUM_TYPES = ["Full-length", "EP", "Demo", "Single", "Live album", "Compilation", "Split"] as const;
export const NAME_MATCHES = ["exact", "prefix", "contains", "suffix"] as const;
export const MISSING = ["lyrics", "similar", "covers", "past_members", "tracks", "other"] as const;

export type Intent = (typeof INTENTS)[number];
export type Group = (typeof GROUPS)[number];
export type Sort = (typeof SORTS)[number];
export type Status = (typeof STATUSES)[number];
export type AlbumType = (typeof ALBUM_TYPES)[number];
export type Missing = (typeof MISSING)[number];
export type NameMatch = (typeof NAME_MATCHES)[number];

export interface Query {
  intent: Intent;
  /** a specific band, by name */
  band?: string;
  /** words that must all appear in the genre, e.g. ["melodic", "death"] */
  genre?: string[];
  /** only bands whose every genre is that genre ("pure doom": Doom, Epic Doom… but not Doom/Death or Doom Rock) */
  pureGenre?: boolean;
  /** country name in English, as in Metal Archives */
  country?: string;
  /** city, state or region */
  location?: string;
  status?: Status;
  formedFrom?: number;
  formedTo?: number;
  /** lyrical themes, as theme concepts (themes.ts): all must appear */
  themes?: string[];
  label?: string;
  /** bands without a label (Unsigned/independent) */
  unsigned?: boolean;
  /** a band name to look for, and how: "exact" (named exactly), "prefix", "contains", "suffix" */
  name?: string;
  nameMatch?: NameMatch;
  /** a musician in the lineup */
  member?: string;
  /** an instrument or role, in English: guitars, bass, drums, vocals, keyboards */
  role?: string;
  /** words of an album title */
  album?: string;
  albumType?: AlbumType;
  releasedFrom?: number;
  releasedTo?: number;
  /** number of reviews, both ends included */
  reviewsMin?: number;
  reviewsMax?: number;
  /** average review rating in %, both ends included (only bands with reviews) */
  ratingMin?: number;
  ratingMax?: number;
  groupBy?: Group;
  sort?: Sort;
  limit?: number;
  /** results skipped after sorting: "el segundo disco" = oldest, offset 1, limit 1 (read by the rules only, not
   * in the model's schema) */
  offset?: number;
  /** for "unsupported": the data that would be needed */
  missing?: Missing;
}

export const MAX_LIMIT = 50;

const TEXT_FIELDS = ["band", "country", "location", "label", "member", "role", "album", "name"] as const;
const YEAR_FIELDS = ["formedFrom", "formedTo", "releasedFrom", "releasedTo"] as const;

/** JSON schema of a query, given to the model to constrain its output. */
export const QUERY_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: INTENTS },
    band: { type: "string" },
    genre: { type: "array", items: { type: "string" } },
    pureGenre: { type: "boolean" },
    country: { type: "string" },
    location: { type: "string" },
    status: { type: "string", enum: STATUSES },
    formedFrom: { type: "integer" },
    formedTo: { type: "integer" },
    themes: { type: "array", items: { type: "string" } },
    label: { type: "string" },
    unsigned: { type: "boolean" },
    name: { type: "string" },
    nameMatch: { type: "string", enum: NAME_MATCHES },
    member: { type: "string" },
    role: { type: "string" },
    album: { type: "string" },
    albumType: { type: "string", enum: ALBUM_TYPES },
    releasedFrom: { type: "integer" },
    releasedTo: { type: "integer" },
    reviewsMin: { type: "integer" },
    reviewsMax: { type: "integer" },
    ratingMin: { type: "integer" },
    ratingMax: { type: "integer" },
    groupBy: { type: "string", enum: GROUPS },
    sort: { type: "string", enum: SORTS },
    limit: { type: "integer" },
    missing: { type: "string", enum: MISSING },
  },
  required: ["intent"],
  additionalProperties: false,
} as const;

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (values as readonly string[]).includes(value);

const cleanText = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const cleanYear = (value: unknown): number | undefined => {
  const year = typeof value === "string" ? Number.parseInt(value, 10) : value;
  return typeof year === "number" && Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : undefined;
};

/** A word list from an array or a single string; empty words dropped. */
const cleanWords = (value: unknown): string[] | undefined => {
  const items = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const words = items.filter((w): w is string => typeof w === "string").flatMap((w) => (w.trim() ? [w.trim()] : []));
  return words.length ? words : undefined;
};

/** The model's output (JSON text or an object) as a valid query; throws if it isn't JSON or has no valid intent. */
export function parseQuery(output: unknown): Query {
  const raw: unknown = typeof output === "string" ? JSON.parse(extractJson(output)) : output;
  if (typeof raw !== "object" || raw === null) throw new Error("not a JSON object");
  const r = raw as Record<string, unknown>;
  if (!isOneOf(INTENTS, r.intent)) throw new Error(`unknown intent: ${String(r.intent)}`);
  const query: Query = { intent: r.intent };
  for (const key of TEXT_FIELDS) {
    const value = cleanText(r[key]);
    if (value) query[key] = value;
  }
  for (const key of YEAR_FIELDS) {
    const value = cleanYear(r[key]);
    if (value) query[key] = value;
  }
  for (const key of ["reviewsMin", "reviewsMax", "ratingMin", "ratingMax"] as const) {
    const value = r[key];
    const top = key.startsWith("rating") ? 100 : 100000;
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= top) query[key] = value;
  }
  const genre = cleanWords(r.genre);
  if (genre) query.genre = genre;
  if (genre && r.pureGenre === true) query.pureGenre = true;
  const themes = cleanWords(r.themes);
  if (themes) query.themes = themes;
  if (isOneOf(STATUSES, r.status)) query.status = r.status;
  if (isOneOf(ALBUM_TYPES, r.albumType)) query.albumType = r.albumType;
  if (isOneOf(GROUPS, r.groupBy)) query.groupBy = r.groupBy;
  if (isOneOf(SORTS, r.sort)) query.sort = r.sort;
  if (isOneOf(MISSING, r.missing)) query.missing = r.missing;
  if (r.unsigned === true) query.unsigned = true;
  if (query.name) query.nameMatch = isOneOf(NAME_MATCHES, r.nameMatch) ? r.nameMatch : "exact";
  if (typeof r.limit === "number" && r.limit >= 1) query.limit = Math.min(Math.floor(r.limit), MAX_LIMIT);
  // a "top" without a grouping is a list of bands
  if (query.intent === "top" && !query.groupBy) query.intent = "bands";
  return query;
}

/** The first {...} block of a text (models sometimes wrap JSON in prose or code fences). */
export function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON object in the model's answer");
  return text.slice(start, end + 1);
}
