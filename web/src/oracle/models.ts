/**
 * The language models that translate questions into queries, all in the browser:
 *  - Chrome's built-in Gemini Nano (Prompt API, Chrome 148+ on desktop), downloaded once by Chrome (~4 GB);
 *  - otherwise WebLLM with a small open model on WebGPU, loaded from a CDN on demand (~1.3 GB, cached).
 * Both get the same instructions, examples and JSON schema.
 */

import { SYSTEM_PROMPT, exampleTurns } from "./prompt";
import { QUERY_SCHEMA } from "./query";

export interface Translator {
  readonly backend: BackendKind;
  /** The model's answer: a JSON query as text. */
  translate(question: string): Promise<string>;
}

export type BackendKind = "chrome" | "webllm";

export type Availability =
  | { kind: "chrome"; ready: boolean } // ready: already downloaded
  | { kind: "webllm" }
  | { kind: "none" };

export type Progress = (fraction: number) => void;

export const WEBLLM_MODEL = "Qwen3.5-2B-q4f16_1-MLC";
const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm@0.2.89";
const LANGUAGES = { expectedInputs: [{ type: "text", languages: ["en", "es"] }] };
/** Gemini Nano only writes some languages; the output is JSON, so English. */
const CHROME_OPTIONS = { ...LANGUAGES, expectedOutputs: [{ type: "text", languages: ["en"] }] };

// ---------- Chrome Prompt API (only what is used) ----------

interface ChromeSession {
  prompt(input: string, options?: { responseConstraint?: object }): Promise<string>;
  clone(): Promise<ChromeSession>;
  destroy(): void;
}

interface ChromeLanguageModel {
  availability(options?: object): Promise<"unavailable" | "downloadable" | "downloading" | "available">;
  create(options?: object): Promise<ChromeSession>;
}

interface DownloadMonitor {
  addEventListener(type: "downloadprogress", listener: (event: { loaded: number }) => void): void;
}

const chromeModel = (): ChromeLanguageModel | undefined =>
  (globalThis as { LanguageModel?: ChromeLanguageModel }).LanguageModel;

// ---------- WebLLM (only what is used) ----------

interface WebLlmEngine {
  chat: {
    completions: {
      create(request: object): Promise<{ choices: { message: { content: string | null } }[] }>;
    };
  };
}

interface WebLlmModule {
  CreateMLCEngine(
    model: string,
    config: { initProgressCallback: (report: { progress: number }) => void },
  ): Promise<WebLlmEngine>;
}

const hasWebGpu = (): boolean => "gpu" in navigator;

/** Which model this browser can use, without downloading anything. */
export async function availability(): Promise<Availability> {
  const chrome = chromeModel();
  if (chrome) {
    try {
      const state = await chrome.availability(CHROME_OPTIONS);
      if (state !== "unavailable") return { kind: "chrome", ready: state === "available" };
    } catch {
      // fall through to WebLLM
    }
  }
  return hasWebGpu() ? { kind: "webllm" } : { kind: "none" };
}

/** Gemini Nano in Chrome. Needs a click (user activation) if the model has to be downloaded. */
export async function chromeTranslator(onProgress: Progress): Promise<Translator> {
  const chrome = chromeModel();
  if (!chrome) throw new Error("no Prompt API");
  const base = await chrome.create({
    ...CHROME_OPTIONS,
    initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }, ...exampleTurns()],
    monitor: (m: DownloadMonitor) => m.addEventListener("downloadprogress", (e) => onProgress(e.loaded)),
  });
  return {
    backend: "chrome",
    async translate(question) {
      // each question starts from the instructions and examples only, not from earlier questions
      const session = await base.clone();
      try {
        return await session.prompt(question, { responseConstraint: QUERY_SCHEMA });
      } finally {
        session.destroy();
      }
    },
  };
}

/** An open model on WebGPU via WebLLM, loaded from the CDN. */
export async function webLlmTranslator(onProgress: Progress, model = WEBLLM_MODEL): Promise<Translator> {
  const url: string = WEBLLM_URL; // a variable, so the bundler leaves the import to the browser
  const webllm = (await import(url)) as WebLlmModule;
  const engine = await webllm.CreateMLCEngine(model, {
    initProgressCallback: (report) => onProgress(report.progress),
  });
  const schema = JSON.stringify(QUERY_SCHEMA);
  return {
    backend: "webllm",
    async translate(question) {
      const reply = await engine.chat.completions.create({
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...exampleTurns(), { role: "user", content: question }],
        response_format: { type: "json_object", schema },
        temperature: 0,
        max_tokens: 300,
        extra_body: { enable_thinking: false },
      });
      return reply.choices[0]?.message.content ?? "";
    },
  };
}
