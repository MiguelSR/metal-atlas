/** Lyrical theme concepts (vocab.ts): finding them in a question and turning them into what to search in the data. */

import { fold } from "../format";
import { THEME_CONCEPTS } from "./vocab";

interface Concept {
  /** the name used in queries: the first data stem ("christian") */
  key: string;
  /** question-side alternatives, folded, longest first */
  words: string[];
  /** data-side regular expression sources */
  stems: string[];
}

const CONCEPTS: Concept[] = THEME_CONCEPTS.map(([question, data]) => {
  const stems = data.split("|");
  return {
    key: stems[0]!.replace(/\$$/, ""),
    words: [...new Set(question.split("|").map(fold))].sort((a, b) => b.length - a.length),
    stems,
  };
});
const BY_KEY = new Map(CONCEPTS.map((c) => [c.key, c]));

const tokensOf = (text: string): string[] =>
  fold(text)
    .split(/[^\p{L}\p{N}'-]+/u)
    .filter(Boolean);

/** Whether a question-side alternative matches at token `i` (returns how many tokens it covers, or 0). */
function matchAt(tokens: string[], i: number, word: string): number {
  const whole = word.endsWith("$");
  const parts = word.replace(/\$$/, "").split(" ");
  for (const [n, part] of parts.entries()) {
    const token = tokens[i + n];
    if (!token) return 0;
    // the last word of an alternative may be the start of a longer word ("cristian" -> "cristianismo")
    const prefix = n === parts.length - 1 && !whole && part.length >= 4;
    if (prefix ? !token.startsWith(part) : token !== part) return 0;
  }
  return parts.length;
}

/** The theme concepts named in a text, in order, each once; every word belongs to one concept at most. */
export function conceptsIn(text: string): string[] {
  const tokens = tokensOf(text);
  const found: string[] = [];
  for (let i = 0; i < tokens.length;) {
    // the longest alternative wins: "lovecraft" is Lovecraft, not love
    let best: { key: string; span: number; length: number } | null = null;
    for (const concept of CONCEPTS) {
      for (const word of concept.words) {
        const span = matchAt(tokens, i, word);
        if (span && (!best || span > best.span || (span === best.span && word.length > best.length))) {
          best = { key: concept.key, span, length: word.length };
        }
      }
    }
    if (best) {
      if (!found.includes(best.key)) found.push(best.key);
      i += best.span;
    } else i++;
  }
  return found;
}

/** A theme word in any language as a concept key, or the folded word when no concept knows it. */
export function themeOf(word: string): string {
  return conceptsIn(word)[0] ?? fold(word).trim();
}

/** Whether a word is a known theme concept. */

/** What to search in the bands' themes for a query theme: the concept's stems, or the word itself. */
export function themeStems(theme: string): string[] {
  return BY_KEY.get(theme)?.stems ?? [fold(theme).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")];
}
