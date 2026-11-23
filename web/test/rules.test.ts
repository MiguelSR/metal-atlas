import { describe, expect, it } from "vitest";

import {
  Clue,
  MAX_POINTS,
  albumClue,
  clueOrder,
  editDistance,
  isCorrectGuess,
  maskName,
  normalizeName,
  shuffled,
  suggestNames,
  verdictIndex,
} from "../src/game/rules";
import { gameBand } from "./fixtures";

/** A deterministic "random" that always returns the same value. */
const fixed = (value: number) => () => value;

describe("game rules", () => {
  it("normalizes names", () => {
    expect(normalizeName("The Black Dahlia Murder")).toBe("blackdahliamurder");
    expect(normalizeName("Motörhead!")).toBe("motorhead");
  });

  it("measures small typos only", () => {
    expect(editDistance("nevermore", "nevermroe")).toBe(2);
    expect(editDistance("abc", "abcdefg")).toBe(9);
  });

  it("forgives case, accents, 'the' and typos depending on the length", () => {
    expect(isCorrectGuess("motorhead", "Motörhead")).toBe(true);
    expect(isCorrectGuess("black dahlia murder", "The Black Dahlia Murder")).toBe(true);
    expect(isCorrectGuess("Nevermor", "Nevermore")).toBe(true); // 1 typo, 9 letters
    expect(isCorrectGuess("Nevrmor", "Nevermore")).toBe(false); // 2 typos
    expect(isCorrectGuess("Asphix", "Asphyx")).toBe(true);
    expect(isCorrectGuess("Sodam", "Sodom")).toBe(true);
    expect(isCorrectGuess("Kix", "Kiss")).toBe(false); // short names must be exact
    expect(isCorrectGuess("  ", "Kiss")).toBe(false);
  });

  it("masks the band's name in clues", () => {
    expect(maskName("Nevermore riffs, nevermore!", "Nevermore", "(self-titled)")).toBe("▒▒▒ riffs, ▒▒▒!");
    expect(maskName("Nevermore", "Nevermore", "(self-titled)")).toBe("▒▒▒ (self-titled)");
    expect(maskName("Mob Rules", "Ox", "(self-titled)")).toBe("Mob Rules"); // too short to mask safely
  });

  it("shuffles without losing items", () => {
    expect(shuffled([1, 2, 3, 4], fixed(0))).toEqual([2, 3, 4, 1]);
    expect(shuffled([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
  });

  it("only uses the clues a band has", () => {
    expect(clueOrder(gameBand())).toHaveLength(6);
    const noPhotoNoReview = clueOrder(gameBand({ 7: null, 8: null }));
    expect(noPhotoNoReview).toHaveLength(4);
    expect(noPhotoNoReview).not.toContain(Clue.Photo);
    expect(noPhotoNoReview).not.toContain(Clue.Review);
  });

  it("picks an album other than the one playing", () => {
    expect(albumClue(["A", "B (Remastered)"], [], "A", fixed(0))).toBe("B (Remastered)");
    expect(albumClue(["A"], [], "A", fixed(0))).toBe("A");
    expect(albumClue([], ["Greatest Hits", "Real Album"], "x", fixed(0))).toBe("Real Album");
    expect(albumClue([], [], "x")).toBe("—");
  });

  it("gives a verdict from the final score", () => {
    expect(MAX_POINTS).toBe(7);
    expect(verdictIndex(70)).toBe(0);
    expect(verdictIndex(42)).toBe(1);
    expect(verdictIndex(0)).toBe(4);
  });

  it("suggests names starting with the text first", () => {
    const names = ["Black Sabbath", "Sabbat", "Sabbath Assembly", "Sabbat"];
    expect(
      suggestNames(
        names.map((n) => n.toLowerCase()),
        names,
        "sabbat",
        3,
      ),
    ).toEqual(["Sabbat", "Sabbath Assembly", "Black Sabbath"]);
  });
});
