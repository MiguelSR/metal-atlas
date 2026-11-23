/** Genre colors. Fixed per genre (never reassigned when filters change); defined as CSS variables in index.html. */

/** legend key of every genre without a color of its own */
export const OTHER_GENRE = "Other genre";

/** genre -> CSS variable, in legend order */
export const COLORED_GENRES: [string, string][] = [
  ["Black Metal", "--g-black"],
  ["Death Metal", "--g-death"],
  ["Thrash Metal", "--g-thrash"],
  ["Heavy Metal", "--g-heavy"],
];

export class GenreColors {
  readonly genres: string[] = COLORED_GENRES.map(([genre]) => genre);
  private readonly colors: Map<string, string>;
  readonly other: string;
  readonly land: string;

  constructor(cssVar: (name: string) => string) {
    this.colors = new Map(COLORED_GENRES.map(([genre, variable]) => [genre, cssVar(variable)]));
    this.other = cssVar("--g-other");
    this.land = cssVar("--land");
  }

  static fromDocument(): GenreColors {
    const style = getComputedStyle(document.documentElement);
    return new GenreColors((name) => style.getPropertyValue(name).trim());
  }

  of(genre: string): string {
    return this.colors.get(genre) ?? this.other;
  }

  has(genre: string): boolean {
    return this.colors.has(genre);
  }

  /** The legend entry a leading genre falls under. */
  legendKey(genre: string | null): string | null {
    if (genre == null) return null;
    return this.colors.has(genre) ? genre : OTHER_GENRE;
  }
}
