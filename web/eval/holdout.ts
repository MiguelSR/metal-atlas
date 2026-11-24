/**
 * Held-out questions: written once and never used to tune the prompt or the rules, so their score is an honest
 * estimate. When a change is tuned on them, move them to questions.ts and write new ones here.
 */

import type { Query } from "../src/oracle/query";

export const HOLDOUT: [question: string, expected: Partial<Query>][] = [
  // empty: write new questions here before tuning the prompt or the rules again
];
