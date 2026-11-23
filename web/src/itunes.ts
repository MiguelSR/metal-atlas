/** Song previews: verified ones from previews.json / game.json, or a live search of the iTunes Search API. */

import type { PreviewsFile, ShortTrack } from "./data";
import { fold } from "./format";

export interface Track {
  url: string;
  title: string;
  album: string;
  /** cover image URL */
  art: string;
}

const AUDIO_PREFIX = "https://audio-ssl.itunes.apple.com/itunes-assets/";

/** Preview URLs are stored without their common prefix (see metal_atlas/game.py). */
export const audioUrl = (url: string): string => (/^https?:/.test(url) ? url : AUDIO_PREFIX + url);

/** Covers are stored as "<server>|<path>"; full URLs (older data, live search) get their size swapped. */
export function coverUrl(cover: string | null | undefined, size: number): string {
  const m = /^(\d)\|(.+)$/.exec(cover ?? "");
  if (m) return `https://is${m[1]}-ssl.mzstatic.com/image/thumb/${m[2]}/${size}x${size}bb.jpg`;
  return (cover ?? "").replace(/100x100bb/, `${size}x${size}bb`);
}

export const expandTrack = ([url, title, album, cover]: ShortTrack, size: number): Track => ({
  url: audioUrl(url),
  title,
  album,
  art: coverUrl(cover, size),
});

interface ItunesArtist {
  artistId: number;
  artistName: string;
  primaryGenreName?: string;
}

interface ItunesSong {
  wrapperType: string;
  trackName?: string;
  collectionName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
}

type Fetch = (url: string) => Promise<Response>;

const RELATED_GENRES =
  /metal|grind|hardcore|punk|rock|industrial|alternative|goth|noise|doom|sludge|ambient|folk|experimental/i;

/** 2 for metal artists, 1 for related genres, 0 for anything else (never picked). */
export function artistRank(artist: ItunesArtist): number {
  const genre = artist.primaryGenreName ?? "";
  return /metal/i.test(genre) ? 2 : RELATED_GENRES.test(genre) ? 1 : 0;
}

async function itunes<T>(query: string, fetchFn: Fetch): Promise<T[]> {
  const response = await fetchFn("https://itunes.apple.com/" + query);
  if (!response.ok) throw new Error(`iTunes: HTTP ${response.status}`);
  return ((await response.json()) as { results?: T[] }).results ?? [];
}

/**
 * Live search by name, for bands never verified. Only an artist with exactly the band's name and a metal or related
 * genre; `taken` artists belong to verified bands, so a namesake (another "Nevermore") never plays their songs.
 */
export async function searchTracks(name: string, taken: Set<number> | null, fetchFn: Fetch = fetch): Promise<Track[]> {
  const artists = await itunes<ItunesArtist>(
    "search?entity=musicArtist&limit=50&term=" + encodeURIComponent(name),
    fetchFn,
  );
  const candidates = artists.filter((a) => fold(a.artistName) === fold(name) && !taken?.has(a.artistId));
  const best = candidates.filter((a) => artistRank(a) > 0).sort((a, b) => artistRank(b) - artistRank(a))[0];
  if (!best) return [];
  const songs = await itunes<ItunesSong>(`lookup?entity=song&limit=25&id=${best.artistId}`, fetchFn);
  const seen = new Set<string>();
  const tracks: Track[] = [];
  for (const song of songs) {
    if (song.wrapperType !== "track" || !song.previewUrl || !song.trackName || seen.has(fold(song.trackName))) continue;
    seen.add(fold(song.trackName));
    tracks.push({
      url: song.previewUrl,
      title: song.trackName,
      album: song.collectionName ?? "",
      art: song.artworkUrl100 ?? "",
    });
  }
  return tracks;
}

/** previews.json, indexed for the map's play buttons. */
export class PreviewIndex {
  private constructor(
    private readonly songs: Record<string, ShortTrack[]>,
    private readonly none: Set<number>,
    readonly taken: Set<number>,
  ) {}

  static from(file: PreviewsFile): PreviewIndex {
    return new PreviewIndex(file.t, new Set(file.none), new Set(file.taken));
  }

  /** Verified songs ([] = known to have none), or undefined if the band was never checked. */
  verified(bandId: number): Track[] | undefined {
    const songs = this.songs[bandId];
    if (songs) return songs.map((s) => expandTrack(s, 100));
    return this.none.has(bandId) ? [] : undefined;
  }
}

/** The songs of a band: verified if known, otherwise a live search. */
export async function tracksFor(
  name: string,
  bandId: number | null,
  previews: PreviewIndex | null,
  fetchFn: Fetch = fetch,
): Promise<Track[]> {
  const verified = previews && bandId != null ? previews.verified(bandId) : undefined;
  return verified ?? searchTracks(name, previews?.taken ?? null, fetchFn);
}
