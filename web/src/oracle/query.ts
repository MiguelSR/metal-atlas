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
  /** results skipped after sorting: "el segundo disco" = oldest, offset 1, limit 1 */
  offset?: number;
  /** for "unsupported": the data that would be needed */
  missing?: Missing;
}

export const MAX_LIMIT = 50;
