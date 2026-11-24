/**
 * Runs the evaluation questions through a model in the browser and scores the queries (see scripts/eval-oracle.mjs).
 * The page has a "start" button (creating a Chrome session can need a click) and writes its log into #__out.
 */

import { type AlbumsFile, type OracleFile, OracleIndex } from "../src/oracle/data";
import { OracleEngine } from "../src/oracle/engine";
import { type Translator, chromeTranslator, webLlmTranslator } from "../src/oracle/models";
import { EXAMPLES } from "../src/oracle/examples";
import { pickRandom } from "../src/oracle/oracle-view";
import { type Query, parseQuery } from "../src/oracle/query";
import { refine } from "../src/oracle/refine";
import { HOLDOUT } from "./holdout";
import { QUESTIONS } from "./questions";
import { mismatches } from "./compare";

const out = document.getElementById("__out")!;
const log = (line: string): void => {
  out.textContent += line + "\n";
};

async function run(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const backend = params.get("backend") ?? "chrome";
  const only = params.get("only");
  const set = params.get("set");
  let t0 = performance.now();
  const progress = (f: number): void => log(`progress ${Math.round(f * 100)}%`);
  const translator: Translator =
    backend === "webllm"
      ? await webLlmTranslator(progress, params.get("model") ?? undefined)
      : await chromeTranslator(progress);
  log(`model ready (${backend}) in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  const index = new OracleIndex((await (await fetch("oracle.json")).json()) as OracleFile);
  index.setAlbums((await (await fetch("oracle-albums.json")).json()) as AlbumsFile);
  const engine = new OracleEngine(index);
  // "examples": a random sample of the generated examples, expected to read as they do without a model
  const questions: [string, Partial<Query>][] =
    set === "holdout"
      ? HOLDOUT
      : set === "examples"
        ? pickRandom([...EXAMPLES.es, ...EXAMPLES.en], 60).map((q) => [q, refine(q, { intent: "bands" }, index)])
        : QUESTIONS;

  let passed = 0;
  let modelOnly = 0;
  let rulesOnly = 0;
  let total = 0;
  const times: number[] = [];
  for (const [n, [question, expected]] of questions.entries()) {
    if (only && !only.split(",").includes(String(n))) continue;
    total++;
    t0 = performance.now();
    let text = "";
    try {
      text = await translator.translate(question);
      const seconds = (performance.now() - t0) / 1000;
      times.push(seconds);
      const raw = parseQuery(text);
      const query = refine(question, raw, index);
      const wrong = mismatches(query, expected);
      if (!mismatches(raw, expected).length) modelOnly++;
      if (!mismatches(refine(question, { intent: "bands" }, index), expected).length) rulesOnly++;
      const answer = engine.run(query).answer;
      const size = "total" in answer ? answer.total : answer.kind === "lineup" ? answer.lineups.length : "-";
      if (!wrong.length) passed++;
      log(`${wrong.length ? "FAIL" : "ok  "} #${n} ${seconds.toFixed(1)}s ${question}`);
      log(`     model ${JSON.stringify(raw)}`);
      log(
        `     query ${JSON.stringify(query)} -> ${answer.kind} ${size}${wrong.length ? "   WRONG " + wrong.join(", ") : ""}`,
      );
    } catch (error) {
      log(`ERR  #${n} ${question}: ${String(error)} :: ${text}`);
    }
  }
  const median = [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] ?? 0;
  log(
    `SCORE ${passed}/${total} (model alone ${modelOnly}, rules alone ${rulesOnly})  median ${median.toFixed(1)} s/question`,
  );
}

document.getElementById("start")!.onclick = () => {
  run()
    .catch((error: unknown) => log(`fatal: ${String(error)}`))
    .finally(() => log("DONE"));
};
