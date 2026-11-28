#!/usr/bin/env node
/**
 * Scores the Oracle's rules on web/eval/questions.ts (or the held-out set, or a sample of the examples):
 *
 *   npm run eval -- [--set questions|holdout|examples] [--only 0,5,7] [--verbose]
 *
 * Needs map/site/oracle.json and map/site/albums/ (`python -m metal_atlas oracle`). Prints the questions read
 * differently than expected (all of them with --verbose) and the score.
 */

import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { build } from "esbuild";

const { values } = parseArgs({
  options: {
    set: { type: "string", default: "questions" },
    only: { type: "string" },
    verbose: { type: "boolean", default: false },
  },
});
const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(WEB, "..", "map", "site");
const out = join(WEB, "node_modules", ".cache", "eval-oracle.mjs");
await build({
  entryPoints: [join(WEB, "eval", "eval.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
});
const { evaluate } = await import(pathToFileURL(out).href);
const file = JSON.parse(await readFile(join(SITE, "oracle.json"), "utf8"));
const albums = await Promise.all(
  (await readdir(join(SITE, "albums"))).map(async (name) =>
    JSON.parse(await readFile(join(SITE, "albums", name), "utf8")),
  ),
);
const only = values.only?.split(",").map(Number);
for (const line of evaluate(file, albums, values.set, only, values.verbose)) console.log(line);
