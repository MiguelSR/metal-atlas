#!/usr/bin/env node
/**
 * Scores the Oracle's model on eval/questions.ts in headless Chrome (real time, driven over the DevTools protocol).
 *
 *   npm run eval -- [--backend chrome|webllm] [--set questions|holdout|examples] [--model WEBLLM_ID] [--only 0,5,7] [--timeout 1800] [--profile DIR]
 *
 * Needs map/site/oracle.json (`python -m metal_atlas oracle`). The Chrome profile (default ~/.cache/metal-atlas-eval)
 * keeps the downloaded models between runs: Gemini Nano (~4 GB, downloaded by Chrome on the first run; copying
 * "OptGuideOnDeviceModel" from your own Chrome profile into it avoids the download) and the WebLLM model (~1.3 GB).
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { build } from "esbuild";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const { values: args } = parseArgs({
  options: {
    backend: { type: "string", default: "chrome" },
    only: { type: "string" },
    set: { type: "string", default: "questions" },
    model: { type: "string" },
    timeout: { type: "string", default: "1800" },
    profile: { type: "string", default: join(homedir(), ".cache", "metal-atlas-eval") },
  },
});

const bundle = await build({
  entryPoints: [join(WEB, "eval", "eval.ts")],
  bundle: true,
  format: "esm",
  target: "es2024",
  write: false,
});
const PAGE = `<!doctype html><meta charset="utf-8"><button id="start" style="width:300px;height:60px">start</button>
<pre id="__out"></pre><script type="module" src="eval.js"></script>`;
const files = {
  "/": ["text/html", PAGE],
  "/eval.js": ["text/javascript", bundle.outputFiles[0].text],
  "/oracle.json": ["application/json", await readFile(join(WEB, "..", "map", "site", "oracle.json"))],
  "/oracle-albums.json": ["application/json", await readFile(join(WEB, "..", "map", "site", "oracle-albums.json"))],
};
const server = createServer((req, res) => {
  const file = files[new URL(req.url, "http://x").pathname];
  if (!file) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": file[0] }).end(file[1]);
}).listen(8790); // a fixed port: WebLLM caches the model per origin
const port = 8790;

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--user-data-dir=${args.profile}`,
    "--remote-debugging-port=9334",
    "--no-first-run",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let targets = [];
for (let i = 0; i < 100 && !targets.length; i++) {
  try {
    targets = (await (await fetch("http://127.0.0.1:9334/json")).json()).filter((t) => t.type === "page");
  } catch {
    await sleep(200);
  }
}
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise((resolve) => (ws.onopen = resolve));
let lastId = 0;
const pending = new Map();
ws.onmessage = (message) => {
  const data = JSON.parse(message.data);
  pending.get(data.id)?.(data.result);
  pending.delete(data.id);
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    pending.set(++lastId, resolve);
    ws.send(JSON.stringify({ id: lastId, method, params }));
  });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression })).result.value;

const query = new URLSearchParams({
  backend: args.backend,
  set: args.set,
  ...(args.only ? { only: args.only } : {}),
  ...(args.model ? { model: args.model } : {}),
});
await send("Page.enable");
await send("Page.navigate", { url: `http://localhost:${port}/?${query}` });
await sleep(1500);
// a real click: creating a Chrome session may need user activation
const [x, y] = JSON.parse(
  await evaluate(`(() => { const b = start.getBoundingClientRect(); return JSON.stringify([b.x + 5, b.y + 5]); })()`),
);
for (const type of ["mousePressed", "mouseReleased"]) {
  await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
}

const deadline = Date.now() + Number(args.timeout) * 1000;
let shown = "";
while (Date.now() < deadline && !shown.includes("DONE")) {
  await sleep(1000);
  const text = (await evaluate("document.getElementById('__out').textContent")) ?? "";
  process.stdout.write(text.slice(shown.length));
  shown = text;
}
if (!shown.includes("DONE")) console.log("\ntimed out");
chrome.kill();
server.close();
process.exit(0);
