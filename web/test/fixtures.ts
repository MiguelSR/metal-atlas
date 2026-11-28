import type { BandIndex, GameRow } from "../src/data";

/** A game band like the rows of game.json. */
export function gameBand(overrides: Partial<Record<number, unknown>> = {}): GameRow {
  const row: GameRow = [
    44,
    "Nevermore",
    0,
    1991,
    "United States",
    [
      ["Warrel Dane", "Vocals"],
      ["Jeff Loomis", "Guitars"],
    ],
    "Last known",
    "https://img/photo.jpg",
    "https://img/logo.png",
    123,
    ["Dreaming Neon Black", "Dead Heart in a Dead World"],
    [["AudioPreview1/a.m4a", "The Heart Collector", "Dreaming Neon Black", "1|Music1/cover.jpg"]],
    "Seattle, Washington",
  ];
  for (const [i, value] of Object.entries(overrides)) (row as unknown[])[Number(i)] = value;
  return row;
}

/** Four bands in two countries (index 0: Sweden, 1: Norway); Oslo is region 2 of Norway. */
export const BANDS: BandIndex = {
  n: ["Machete", "Black Machete", "Mayhem", "Old Band"],
  y: [1995, 2005, 1984, 0],
  a: "1101",
  g: [[0], [0, 1], [1], [0]],
  l: [[[0]], [[0], [1, 2]], [[1, 2]], [[0]]],
  id: [1, 2, 3, 4],
  s: {},
};
