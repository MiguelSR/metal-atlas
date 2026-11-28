/** Game rules, without the DOM: answer checking, clue order, scoring. */

import type { GameRow } from "../data";
import { fold } from "../format";

export const ROUNDS = 10;

export enum Clue {
  Origin = 0,
  Formed = 1,
  Lineup = 2,
  Album = 3,
  Photo = 4,
}

export const ALL_CLUES: readonly Clue[] = [Clue.Origin, Clue.Formed, Clue.Lineup, Clue.Album, Clue.Photo];
export const CLUE_COUNT = ALL_CLUES.length;
/** a correct guess with no clues; each revealed clue costs one point */
export const MAX_POINTS = CLUE_COUNT + 1;

/** A comparable form of a band name: folded, without a leading "the", punctuation, symbols or spaces. */
export function normalizeName(name: string): string {
  return fold(name)
    .replace(/^the\s+/, "")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

/** Levenshtein distance; anything above 2 is reported as 9 (only small typos matter). */
export function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 9;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length]!;
}

/** Case, accents, punctuation and small typos are forgiven (more for longer names). */
export function isCorrectGuess(guess: string, name: string): boolean {
  const a = normalizeName(guess);
  const b = normalizeName(name);
  if (!a) return false;
  if (a === b) return true;
  const allowed = b.length >= 10 ? 2 : b.length >= 5 ? 1 : 0;
  return editDistance(a, b) <= allowed;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const MASK = "▒▒▒";

/** Hides the band's name in a clue ("Iron Maiden" in a member's name, a self-titled album). A clue that is only the name is self-titled. */
export function maskName(text: string, bandName: string, selfTitled: string): string {
  if (bandName.length < 3) return text;
  const masked = text.replace(new RegExp(escapeRegExp(bandName), "gi"), MASK);
  return masked.trim() === MASK ? `${MASK} ${selfTitled}` : masked;
}

export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Whether the band has data for a clue (only the photo can be missing). */
export function hasClue(band: GameRow, clue: Clue): boolean {
  if (clue === Clue.Photo) return !!band[7];
  return true;
}

/** This round's clues: only those the band has, in random order. */
export function clueOrder(band: GameRow, random: () => number = Math.random): Clue[] {
  return shuffled(
    ALL_CLUES.filter((c) => hasClue(band, c)),
    random,
  );
}

const COMPILATION =
  /\b(live|best of|greatest|hits|collection|compilation|anthology|essential|demo|remaster|box set|tribute)\b/i;
const albumKey = (title: string | undefined): string =>
  fold(title ?? "")
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/[\p{P}\p{S}\s]+/gu, "");

/** The album clue: from the band's discography, preferably not the album the clip comes from. */
export function albumClue(
  discography: string[],
  clipAlbums: string[],
  playingAlbum: string,
  random: () => number = Math.random,
): string {
  const albums = discography.length ? discography : [...new Set(clipAlbums.filter((a) => a && !COMPILATION.test(a)))];
  const others = albums.filter((a) => albumKey(a) !== albumKey(playingAlbum));
  const pool = others.length ? others : albums;
  return pool[Math.floor(random() * pool.length)] ?? "—";
}

/** Index of the verdict for a final score (0 = best). */
export function verdictIndex(score: number, rounds = ROUNDS): number {
  const share = score / (rounds * MAX_POINTS);
  return share >= 0.8 ? 0 : share >= 0.6 ? 1 : share >= 0.4 ? 2 : share >= 0.2 ? 3 : 4;
}

/** Band names starting with the text first, then containing it; up to `limit`, without repeats. */
export function suggestNames(foldedNames: string[], names: string[], foldedText: string, limit = 6): string[] {
  const out: string[] = [];
  for (const test of [(n: string) => n.startsWith(foldedText), (n: string) => n.includes(foldedText)]) {
    for (let i = 0; i < foldedNames.length && out.length < limit; i++) {
      if (test(foldedNames[i]!) && !out.includes(names[i]!)) out.push(names[i]!);
    }
  }
  return out;
}
