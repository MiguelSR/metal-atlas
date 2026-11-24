/** Comparing a query with the fields it should have (evaluation and example generation). */

import { fold } from "../src/format";
import type { Query } from "../src/oracle/query";

const same = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) && Array.isArray(b)) {
    const set = (xs: unknown[]): string =>
      xs
        .map((x) => fold(String(x)))
        .sort()
        .join("|");
    return set(a) === set(b);
  }
  if (typeof a === "string" && typeof b === "string") return fold(a) === fold(b);
  return a === b;
};

/** The expected fields that the query gets wrong. */
export function mismatches(query: Query, expected: Partial<Query>): string[] {
  return Object.entries(expected).flatMap(([key, value]) =>
    same(query[key as keyof Query], value) ? [] : [`${key}: ${JSON.stringify(query[key as keyof Query])}`],
  );
}
