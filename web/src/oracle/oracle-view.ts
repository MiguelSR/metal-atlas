/**
 * The Oracle (desktop only): questions in plain words, answered from the band data.
 * A language model in the browser (models.ts) reads the question, `refine` checks it against the question's own
 * words, and the engine answers. Without a model (not loaded yet, or none available) the rules alone read it.
 */

import { getJson, lazy } from "../data";
import { bandUrl, esc } from "../format";
import type { Translate } from "../i18n";
import type { PreviewPlayer } from "../player";
import type { AppState } from "../state";
import { type OracleFile, OracleIndex } from "./data";
import { describeQuery } from "./describe";
import { type Answer, OracleEngine, type Result } from "./engine";
import { type Availability, type Translator, availability, chromeTranslator, webLlmTranslator } from "./models";
import { type Query, STATUSES, parseQuery } from "./query";
import { refine } from "./refine";

const INTRO_KEY = "ma-oracle-intro";
const WEBLLM_KEY = "ma-oracle-webllm";

type ModelState =
  | { kind: "checking" }
  | { kind: "offer"; availability: Availability } // a button to download or load a model
  | { kind: "none" }
  | { kind: "loading"; progress: number }
  | { kind: "ready" }
  | { kind: "error"; message: string };

interface Asked {
  question: string;
  result?: Result;
  query?: Query;
  seconds?: number;
  by?: "chrome" | "webllm" | "rules";
  badModelAnswer?: boolean;
  error?: string;
}

const stored = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const store = (key: string): void => {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // storage blocked: asked again next time
  }
};

export class OracleView {
  private model: ModelState = { kind: "checking" };
  private translator: Translator | null = null;
  private available: Availability | null = null;
  private showIntro = !stored(INTRO_KEY);
  private dataState: "loading" | "ready" | "error" = "loading";
  private busy = false;
  private readonly asked: Asked[] = [];
  private loaded: { index: OracleIndex; engine: OracleEngine } | null = null;
  private readonly load = lazy(async () => {
    const index = new OracleIndex(await getJson<OracleFile>("oracle.json"));
    return (this.loaded = { index, engine: new OracleEngine(index) });
  });

  constructor(
    private readonly element: HTMLElement,
    private readonly state: AppState,
    private readonly player: PreviewPlayer,
  ) {
    element.addEventListener("click", (e) => this.onClick(e));
    element.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = element.querySelector<HTMLInputElement>("#oq");
      if (input?.value.trim()) void this.ask(input.value.trim());
    });
  }

  private get t(): Translate {
    return this.state.t;
  }

  show(on: boolean): void {
    this.element.hidden = !on;
    if (!on) return;
    this.render();
    if (this.dataState !== "ready") {
      this.dataState = "loading";
      this.load().then(
        () => this.setData("ready"),
        () => this.setData("error"),
      );
    }
    if (this.model.kind === "checking") void this.checkModel();
    this.element.querySelector<HTMLInputElement>("#oq")?.focus();
  }

  private setData(state: "ready" | "error"): void {
    this.dataState = state;
    this.render();
  }

  // ---------- model ----------

  private async checkModel(): Promise<void> {
    this.available = await availability();
    if (this.available.kind === "none") this.model = { kind: "none" };
    else if (this.available.kind === "chrome" && this.available.ready) {
      void this.loadModel(); // already on the computer: no download, no click needed
      return;
    } else this.model = { kind: "offer", availability: this.available };
    this.render();
  }

  private async loadModel(): Promise<void> {
    if (!this.available || this.available.kind === "none") return;
    this.model = { kind: "loading", progress: 0 };
    this.render();
    const progress = (fraction: number): void => {
      this.model = { kind: "loading", progress: fraction };
      this.renderStatus();
    };
    try {
      this.translator =
        this.available.kind === "chrome" ? await chromeTranslator(progress) : await webLlmTranslator(progress);
      if (this.available.kind === "webllm") store(WEBLLM_KEY);
      this.model = { kind: "ready" };
    } catch (error) {
      this.model = { kind: "error", message: error instanceof Error ? error.message : String(error) };
    }
    this.render();
  }

  // ---------- questions ----------

  private async ask(question: string): Promise<void> {
    if (this.busy || this.dataState !== "ready") return;
    this.busy = true;
    const entry: Asked = { question };
    this.asked.unshift(entry);
    this.render();
    try {
      const { index, engine } = await this.load();
      const started = performance.now();
      let modelQuery: Query = { intent: "bands" };
      entry.by = "rules";
      if (this.translator) {
        try {
          modelQuery = parseQuery(await this.translator.translate(question));
          entry.by = this.translator.backend;
        } catch {
          entry.badModelAnswer = true;
        }
      }
      entry.query = refine(question, modelQuery, index);
      entry.result = engine.run(entry.query);
      entry.seconds = (performance.now() - started) / 1000;
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error);
    }
    this.busy = false;
    this.render();
    const input = this.element.querySelector<HTMLInputElement>("#oq");
    if (input) {
      input.value = "";
      input.focus();
    }
  }

  private onClick(e: MouseEvent): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-o]");
    if (!target) return;
    switch (target.dataset.o) {
      case "intro":
        this.showIntro = !this.showIntro;
        if (!this.showIntro) store(INTRO_KEY);
        this.render();
        break;
      case "example":
        void this.ask(target.textContent);
        break;
      case "load":
        void this.loadModel();
        break;
    }
  }

  // ---------- rendering ----------

  private render(): void {
    const t = this.t;
    const typed = this.element.querySelector<HTMLInputElement>("#oq")?.value ?? "";
    const intro = this.showIntro
      ? `<section class="ointro"><h3>${t("oIntroTitle")}</h3><ul>${t("oIntro")
          .map((line) => `<li>${line}</li>`)
          .join("")}</ul><button class="gbtn primary" data-o="intro">${t("oGotIt")}</button></section>`
      : "";
    const disabled = this.busy || this.dataState !== "ready" ? "disabled" : "";
    const examples = t("oExamples")
      .map((q) => `<button type="button" class="oex" data-o="example" ${disabled}>${esc(q)}</button>`)
      .join("");
    this.element.innerHTML = `<div class="ocard">
      <div class="ohead"><h2>${t("oTitle")}</h2><button class="olink" data-o="intro">${t("oHow")}</button></div>
      <p class="gtx">${t("oLead")}</p>
      ${intro}
      <form class="gform oform"><input id="oq" autocomplete="off" placeholder="${esc(t("oPh"))}" aria-label="${esc(t("oTitle"))}" ${disabled}>
        <button class="gbtn primary" ${disabled}>${t("oAsk")}</button></form>
      <div class="oexs"><span>${t("oTry")}:</span>${examples}</div>
      <div class="ostatus" id="ostatus"></div>
      <ol class="oanswers">${this.asked.map((a) => this.answerHtml(a)).join("")}</ol>
    </div>`;
    const input = this.element.querySelector<HTMLInputElement>("#oq");
    if (input && typed && !this.busy) input.value = typed;
    this.renderStatus();
  }

  private renderStatus(): void {
    const box = this.element.querySelector("#ostatus");
    if (!box) return;
    const t = this.t;
    const lines: string[] = [];
    if (this.dataState === "loading") lines.push(`<span class="ospin"></span>${t("oDataLoading")}`);
    if (this.dataState === "error") lines.push(`<span class="oerr">${t("oDataError")}</span>`);
    const m = this.model;
    switch (m.kind) {
      case "checking":
        lines.push(`<span class="ospin"></span>${t("oChecking")}`);
        break;
      case "offer": {
        const webllm = m.availability.kind === "webllm";
        const cached = webllm && stored(WEBLLM_KEY);
        const text = webllm ? (cached ? t("oWebllmCached") : t("oWebllm")) : t("oChromeDownload");
        const button = webllm ? (cached ? t("oWebllmLoad") : t("oWebllmBtn")) : t("oChromeBtn");
        lines.push(`${text} <button class="gbtn" data-o="load">${button}</button>`, t("oNoModelYet"));
        break;
      }
      case "none":
        lines.push(t("oNoModel"));
        break;
      case "loading":
        lines.push(
          `<span class="ospin"></span>${t("oLoadingModel", Math.round(m.progress * 100))}<span class="obar"><i style="width:${m.progress * 100}%"></i></span>`,
          t("oNoModelYet"),
        );
        break;
      case "ready":
        lines.push(this.translator?.backend === "webllm" ? t("oWebllmReady") : t("oChromeReady"));
        break;
      case "error":
        lines.push(`<span class="oerr">${t("oModelError", esc(m.message))}</span>`);
        break;
    }
    box.innerHTML = lines.map((line) => `<div>${line}</div>`).join("");
  }

  private answerHtml(a: Asked): string {
    const t = this.t;
    const head = `<div class="oq">${esc(a.question)}</div>`;
    if (a.error) return `<li class="oa">${head}<div class="oerr">${esc(a.error)}</div></li>`;
    if (!a.result || !a.query)
      return `<li class="oa">${head}<div class="othink"><span class="ospin"></span>${t("oThinking")}</div></li>`;
    const chips = describeQuery(a.query, t, this.state.countryName)
      .map((c) => `<span class="chip">${esc(c)}</span>`)
      .join("");
    const notes = [
      ...(a.badModelAnswer ? [t("oBadAnswer")] : []),
      ...a.result.notes.map((n) => t("oCountryAsLocation", n.value)),
    ]
      .map((n) => `<div class="onote">${esc(n)}</div>`)
      .join("");
    const took = t("oTook", (a.seconds ?? 0).toFixed(1), t("oBy")[a.by ?? "rules"]);
    return `<li class="oa">${head}<div class="ometa"><span class="olab">${t("oUnderstood")}</span>${chips}<span class="otook">${took}</span></div>
      ${notes}<div class="obody">${this.bodyHtml(a.result.answer, a.query)}</div></li>`;
  }

  private bodyHtml(answer: Answer, query: Query): string {
    const t = this.t;
    const { index } = this.loaded!;
    switch (answer.kind) {
      case "unsupported":
        return `<p class="omsg">${t("oUnsupported")[answer.missing]}</p>`;
      case "count":
        return `<div class="obig">${t("oBands", answer.total)}</div>${answer.rows.length ? `<ol class="obands">${answer.rows.map((r, i) => this.bandHtml(r, i)).join("")}</ol>` : ""}`;
      case "bands": {
        if (!answer.total) return `<p class="omsg">${t("oNoBands")}</p>`;
        const showing = answer.rows.length < answer.total ? ` · ${t("oShowing", answer.rows.length)}` : "";
        return `<div class="osum">${t("oBands", answer.total)}${showing}</div><ol class="obands">${answer.rows.map((r, i) => this.bandHtml(r, i)).join("")}</ol>`;
      }
      case "top": {
        if (!answer.groups.length) return `<p class="omsg">${t("oNoBands")}</p>`;
        const max = answer.groups[0]!.count;
        const rows = answer.groups
          .map(({ key, count }, i) => {
            const shown = this.groupName(key, query);
            return `<li class="og"><span class="rk">${i + 1}</span><span class="nm">${esc(shown)}</span><span class="ct">${this.state.nf(count)}</span>
              <span class="track"><span class="fill" style="width:${(100 * count) / max}%"></span></span></li>`;
          })
          .join("");
        return `<div class="osum">${t("oBands", answer.total)}</div><ol class="ogroups">${rows}</ol>`;
      }
      case "albums": {
        const missing = answer.bandsWithoutData
          ? `<div class="onote">${t("oNoAlbumData", answer.bandsWithoutData)}</div>`
          : "";
        if (!answer.albums.length) return `<p class="omsg">${t("oNoAlbums")}</p>${missing}`;
        const bands = new Set(answer.albums.map((h) => h.row));
        const rows = answer.albums
          .map(({ row, album: [, title, type, year] }) => {
            const band = bands.size > 1 ? ` <span class="ob">— ${this.bandLink(row)}</span>` : "";
            return `<li><span class="oy">${year ?? "?"}</span><span><b>${esc(title)}</b> <small>${esc(type)}</small>${band}</span></li>`;
          })
          .join("");
        const title =
          bands.size === 1
            ? `<div class="osum">${this.bandLink([...bands][0]!)} ${this.player.button(index.data.name[[...bands][0]!]!, index.data.id[[...bands][0]!]!)}</div>`
            : "";
        const showing =
          answer.albums.length > 1 && answer.albums.length < answer.total
            ? `<div class="osum">${t("oAlbums", answer.total)} · ${t("oShowing", answer.albums.length)}</div>`
            : "";
        // the "no data" note only matters when nothing was found (otherwise it is about namesakes)
        return `${title}${showing}<ol class="oalbums">${rows}</ol>`;
      }
      case "lineup": {
        const missing = answer.bandsWithoutData
          ? `<div class="onote">${t("oNoLineupData", answer.bandsWithoutData)}</div>`
          : "";
        if (!answer.lineups.length) return `<p class="omsg">${t("oNoBands")}</p>${missing}`;
        const blocks = answer.lineups
          .map(({ row, header, members, all }) => {
            const items = (list: [string, string][]): string =>
              `<ul class="omembers">${list.map(([name, role]) => `<li><b>${esc(name)}</b> <small>${esc(role)}</small></li>`).join("")}</ul>`;
            const list = members.length ? items(members) : `<p class="onote">${t("oNoMembers")}</p>${items(all)}`;
            return `<div class="olineup"><div class="osum">${this.bandLink(row)} ${this.player.button(index.data.name[row]!, index.data.id[row]!)} <small>${esc(t("lineupHdr", header))}</small></div>${list}</div>`;
          })
          .join("");
        return blocks;
      }
    }
  }

  private bandLink(row: number): string {
    const { data } = this.loaded!.index;
    const name = data.name[row]!;
    return `<a href="${bandUrl(data.id[row]!, name, data.slug[row])}" target="_blank" rel="noopener">${esc(name)}</a>`;
  }

  private bandHtml(row: number, rank: number): string {
    const t = this.t;
    const { index } = this.loaded!;
    const { data } = index;
    const place = [
      index.text("location", row),
      data.country[row]!.map((c) => this.state.countryName(data.countries[c]!)).join(" / "),
    ]
      .filter(Boolean)
      .join(", ");
    const status = data.status[row]!;
    const year = data.year[row]!;
    const reviews = data.reviews[row]!;
    const chips = [
      year ? `<span class="chip">${t("formedY", year)}</span>` : "",
      status
        ? `<span class="chip ${status === 1 ? "on" : status === 3 ? "off" : ""}">${t("status")[status]}</span>`
        : "",
      reviews ? `<span class="chip rv">${t("reviews", reviews, data.rating[row]!)}</span>` : "",
    ].join("");
    return `<li class="b"><span class="rk">${rank + 1}</span><div style="min-width:0"><div class="nmr">${this.bandLink(row)}${this.player.button(data.name[row]!, data.id[row]!)}</div>
      <div class="ln">${esc(index.text("genre", row))}${place ? " · " + esc(place) : ""}</div><div class="chips">${chips}</div></div></li>`;
  }

  /** A group's name in the viewer's language (countries and statuses are translated). */
  private groupName(key: string, query: Query): string {
    if (query.groupBy === "status") return this.t("status")[(STATUSES as readonly string[]).indexOf(key) + 1] ?? key;
    return query.groupBy === "country" ? this.state.countryName(key) : key;
  }
}
