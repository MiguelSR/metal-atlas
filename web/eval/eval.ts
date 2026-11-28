/**
 * Scores how the rules read the evaluation questions (see scripts/eval-oracle.mjs): each question's query against
 * the expected one, and each answer's size.
 */

import type { AlbumsFile, OracleFile } from "../src/oracle/data";
import { OracleIndex } from "../src/oracle/data";
import { OracleEngine } from "../src/oracle/engine";
import { EXAMPLES } from "../src/oracle/examples";
import { pickRandom } from "../src/oracle/oracle-view";
import type { Query } from "../src/oracle/query";
import { refine } from "../src/oracle/refine";
import { mismatches } from "./compare";
import { HOLDOUT } from "./holdout";
import { QUESTIONS } from "./questions";

export type EvalSet = "questions" | "holdout" | "examples";

/** The log lines of an evaluation, ending with the score. `only`: question numbers to run. */
export function evaluate(file: OracleFile, albums: AlbumsFile[], set: EvalSet, only?: number[], verbose = false) {
  const index = new OracleIndex(file);
  for (const block of albums) index.setAlbums(block);
  const engine = new OracleEngine(index);
  // "examples": a sample of the generated examples, which must still read as they did when generated
  const questions: [string, Partial<Query>][] =
    set === "holdout"
      ? HOLDOUT
      : set === "examples"
        ? pickRandom([...EXAMPLES.es, ...EXAMPLES.en], 200).map((q) => [q, refine(q, index)])
        : QUESTIONS;
  const lines: string[] = [];
  let passed = 0;
  let total = 0;
  for (const [n, [question, expected]] of questions.entries()) {
    if (only && !only.includes(n)) continue;
    total++;
    const query = refine(question, index);
    const wrong = mismatches(query, expected);
    if (!wrong.length) passed++;
    if (!wrong.length && !verbose) continue;
    const answer = engine.run(query).answer;
    const size = "total" in answer ? answer.total : answer.kind === "lineup" ? answer.lineups.length : "-";
    lines.push(`${wrong.length ? "FAIL" : "ok  "} #${n} ${question}`);
    lines.push(
      `     query ${JSON.stringify(query)} -> ${answer.kind} ${size}${wrong.length ? "   WRONG " + wrong.join(", ") : ""}`,
    );
  }
  lines.push(`SCORE ${passed}/${total}`);
  return lines;
}
