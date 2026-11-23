/** Game mode: setup -> rounds (clip, clues, guesses) -> final score. */

import { type GameData, type GameRow, getJson, lazy } from "../data";
import { bandUrl, esc, fold } from "../format";
import type { Translate } from "../i18n";
import { ICONS } from "../icons";
import { type Track, expandTrack, searchTracks } from "../itunes";
import type { AppState } from "../state";
import { type ClueContext, clueHtml } from "./clues";
import { Clue, MAX_POINTS, ROUNDS, albumClue, clueOrder, isCorrectGuess, suggestNames, verdictIndex } from "./rules";
import { playTestChord } from "./sound";

type Phase = "setup" | "loading" | "error" | "round" | "end";
const CLIP_CHOICES = 10; // the clip is one of the band's first songs
const DRAW_ATTEMPTS = 20;

interface Round {
  band: GameRow;
  track: Track;
  album: string;
  order: Clue[];
  /** clues revealed so far */
  shown: number;
  done: boolean;
  points: number;
  wrong: string[];
  message: string;
  /** a clue was just revealed (entrance animation) */
  fresh: boolean;
}

type Draw = { band: GameRow; tracks: Track[] } | { error: true } | null;

export class GameView {
  private readonly audio = new Audio();
  private phase: Phase = "setup";
  private level = 0;
  private roundNo = 0;
  private score = 0;
  private history: [string, number][] = [];
  private round: Round | null = null;
  private next: Promise<Draw> | null = null;
  private blocked = false;
  private readonly used = new Set<number>();
  private data: GameData | null = null;
  private readonly load = lazy(async () => (this.data = await getJson<GameData>("game.json")));

  constructor(
    private readonly element: HTMLElement,
    private readonly modeButton: HTMLElement,
    private readonly state: AppState,
    private readonly onEnter: () => void,
  ) {
    this.audio.volume = 0.8;
    modeButton.onclick = () => this.setMode(!document.body.classList.contains("game-on"));
    element.addEventListener("click", (e) => this.onClick(e));
    element.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = element.querySelector<HTMLInputElement>("#gq");
      if (input) this.guess(input.value);
    });
    element.addEventListener("input", (e) => this.suggest(e.target as HTMLInputElement));
    element.addEventListener("error", (e) => this.onImageError(e.target as HTMLElement), true);
    for (const event of ["play", "pause"]) this.audio.addEventListener(event, () => this.syncPlayer());
    this.audio.addEventListener("timeupdate", () => {
      const bar = element.querySelector<HTMLElement>(".gbar i");
      if (bar && this.audio.duration) bar.style.width = `${(100 * this.audio.currentTime) / this.audio.duration}%`;
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !element.hidden && this.phase === "setup") this.setMode(false);
    });
  }

  /** Read through a method: TypeScript would otherwise assume the phase can't change across an await. */
  private currentPhase(): Phase {
    return this.phase;
  }

  private get t(): Translate {
    return this.state.t;
  }

  setMode(on: boolean): void {
    document.body.classList.toggle("game-on", on);
    this.modeButton.textContent = on ? this.t("modeMap") : this.t("modeGame");
    this.modeButton.setAttribute("aria-pressed", String(on));
    this.element.hidden = !on;
    if (!on) {
      this.audio.pause();
      return;
    }
    this.onEnter();
    void this.load().then(() => this.phase === "setup" && this.render());
    void this.state.loadBands(); // for the name suggestions
    this.render();
  }

  // ---------- rounds ----------

  private async tracksOf(band: GameRow): Promise<Track[]> {
    if (band[13].length) return band[13].map((t) => expandTrack(t, 600));
    const found = await searchTracks(band[1], null); // only with game.py --mixed
    return found.map((t) => ({ ...t, art: t.art.replace(/100x100bb/, "600x600bb") }));
  }

  /** A band of the level not played recently, with songs. */
  private async draw(level: number): Promise<Draw> {
    const data = await this.load();
    const pool = data.levels[level]!;
    for (let attempt = 0; attempt < DRAW_ATTEMPTS; attempt++) {
      let candidates = pool.filter((i) => !this.used.has(i));
      if (!candidates.length) {
        pool.forEach((i) => this.used.delete(i));
        candidates = pool;
      }
      const pick = candidates[Math.floor(Math.random() * candidates.length)]!;
      this.used.add(pick);
      const band = data.b[pick]!;
      let tracks: Track[];
      try {
        tracks = await this.tracksOf(band);
      } catch {
        return { error: true };
      }
      if (tracks.length) return { band, tracks };
    }
    return null;
  }

  private start(): void {
    this.roundNo = 0;
    this.score = 0;
    this.history = [];
    this.round = null;
    this.next = null;
    void this.nextRound();
  }

  private async nextRound(): Promise<void> {
    this.audio.pause();
    this.phase = "loading";
    this.render();
    const level = this.level;
    const drawn = await (this.next ?? this.draw(level));
    this.next = null;
    if (this.currentPhase() !== "loading") return; // the player left meanwhile
    if (!drawn || "error" in drawn) {
      this.phase = "error";
      this.render();
      return;
    }
    const { band, tracks } = drawn;
    const track = tracks[Math.floor(Math.random() * Math.min(tracks.length, CLIP_CHOICES))]!;
    this.roundNo++;
    this.round = {
      band,
      track,
      album: albumClue(
        band[12],
        tracks.map((t) => t.album),
        track.album,
      ),
      order: clueOrder(band),
      shown: 0,
      done: false,
      points: 0,
      wrong: [],
      message: "",
      fresh: false,
    };
    this.phase = "round";
    if (this.roundNo < ROUNDS) this.next = this.draw(level); // prefetch while this one plays
    this.audio.src = track.url;
    this.blocked = false;
    this.audio.play().catch(() => {
      this.blocked = true;
      this.render();
    });
    this.render();
  }

  private reveal(): void {
    const round = this.round;
    if (round && !round.done && round.shown < round.order.length) {
      round.shown++;
      round.fresh = true;
    }
  }

  private finish(points: number): void {
    const round = this.round!;
    round.done = true;
    round.points = points;
    this.score += points;
    this.history.push([round.band[1], points]);
    this.render();
  }

  private guess(text: string): void {
    const round = this.round;
    if (!round || round.done || !text.trim()) return;
    if (isCorrectGuess(text, round.band[1])) {
      this.finish(MAX_POINTS - round.shown);
      return;
    }
    round.wrong.push(text.trim());
    if (round.shown < round.order.length) {
      this.reveal();
      round.message = this.t("notIt", text.trim());
      this.render();
    } else {
      this.finish(0);
    }
  }

  // ---------- events ----------

  private onClick(e: MouseEvent): void {
    const target = e.target as Element;
    const level = target.closest<HTMLElement>(".lvl");
    if (level) {
      this.level = Number(level.dataset.l);
      this.next = null;
      this.render();
      return;
    }
    const suggestion = target.closest<HTMLElement>("[data-sug]");
    if (suggestion) {
      this.guess(suggestion.dataset.sug ?? "");
      return;
    }
    switch (target.closest<HTMLElement>("[data-a]")?.dataset.a) {
      case "start":
        this.start();
        break;
      case "retry":
      case "next":
        void this.nextRound();
        break;
      case "map":
        this.setMode(false);
        break;
      case "menu":
        this.audio.pause();
        this.phase = "setup";
        this.round = null;
        this.next = null;
        this.render();
        break;
      case "end":
        this.phase = "end";
        this.render();
        break;
      case "pp":
        this.togglePlayback();
        break;
      case "reveal":
        if (this.round) this.round.message = "";
        this.reveal();
        this.render();
        break;
      case "giveup":
        this.finish(0);
        break;
      case "test":
        playTestChord();
        break;
    }
  }

  private togglePlayback(): void {
    if (this.audio.paused) {
      this.audio.play().catch(() => undefined);
    } else {
      this.audio.pause();
    }
  }

  private suggest(input: HTMLInputElement): void {
    if (input.id !== "gq") return;
    const list = this.element.querySelector<HTMLElement>("#gsug");
    if (!list) return;
    const text = fold(input.value.trim());
    const bands = this.state.bands;
    const names = text.length >= 2 && bands ? suggestNames(bands.folded, bands.n, text) : [];
    list.innerHTML = names
      .map((n) => `<li><button type="button" data-sug="${esc(n)}">${esc(n)}</button></li>`)
      .join("");
  }

  /** Broken images: the photo clue shows a note, answer images disappear. */
  private onImageError(img: HTMLElement): void {
    if (img.tagName !== "IMG") return;
    if (img.dataset.fallback) {
      const note = document.createElement("small");
      note.textContent = img.dataset.fallback;
      img.replaceWith(note);
    } else {
      img.remove();
    }
  }

  private playLabel(): string {
    if (!this.audio.paused) return this.t("nowPlaying");
    return this.blocked ? this.t("tapPlay") : this.t("paused");
  }

  /** Updates the play button and equalizer without redrawing the card. */
  private syncPlayer(): void {
    if (!this.audio.paused) this.blocked = false;
    const paused = this.audio.paused;
    const button = this.element.querySelector<HTMLElement>(".pp");
    if (button) {
      button.innerHTML = paused ? ICONS.play : ICONS.pause;
      button.setAttribute("aria-label", paused ? this.t("clipPlay") : this.t("clipPause"));
      button.classList.toggle("pulse", paused);
    }
    this.element.querySelector(".eq")?.classList.toggle("on", !paused);
    const label = this.element.querySelector(".gst");
    if (label) label.textContent = this.playLabel();
  }

  // ---------- rendering ----------

  render(): void {
    if (this.element.hidden) return;
    const html =
      this.phase === "setup"
        ? this.setupHtml()
        : this.phase === "loading"
          ? this.header(this.t("round", this.roundNo + 1, ROUNDS, this.score)) +
            `<div class="gloading">${this.t("picking")}</div>`
          : this.phase === "error"
            ? this.errorHtml()
            : this.phase === "round"
              ? this.roundHtml(this.round!)
              : this.endHtml();
    this.element.innerHTML = `<div class="gcard">${html}</div>`;
    if (this.round) this.round.fresh = false;
    this.element.querySelector<HTMLInputElement>("#gq")?.focus({ preventScroll: true });
  }

  private levels(): [string, string][] {
    return this.t("levels");
  }

  private header(extra: string): string {
    return `<div class="ghead"><span>${esc(this.levels()[this.level]![0])}</span><span>${extra}</span></div>`;
  }

  private setupHtml(): string {
    const t = this.t;
    const levels = this.levels()
      .map(([name, description], i) => {
        const empty = this.data && !this.data.levels[i]!.length;
        return `<button class="lvl ${i === this.level ? "on" : ""}" role="radio" aria-checked="${i === this.level}" data-l="${i}" ${empty ? "disabled" : ""}><b>${i + 1}</b><span><strong>${name}</strong><small>${description}</small></span></button>`;
      })
      .join("");
    return `<div class="eyebrow" style="padding:0">${t("gEyebrow")}</div><h2>${t("gTitle")}</h2>
      <div class="sound"><span class="spk" aria-hidden="true">${ICONS.volume}</span><div><b>${t("soundT")}</b><span>${t("soundS")}</span></div>
        <button class="gbtn" data-a="test">${t("soundTest")}</button></div>
      <p class="gtx">${t("gRules", ROUNDS, MAX_POINTS)}</p>
      <div class="lvls" role="radiogroup" aria-label="${t("difficulty")}">${levels}</div>
      <div class="grow"><button class="gbtn ghost" data-a="map">${t("backMap")}</button><button class="gbtn primary" data-a="start">${t("start")}</button></div>`;
  }

  private errorHtml(): string {
    const t = this.t;
    return `<h2>${t("noMusicT")}</h2><p class="gtx">${t("noMusic")}</p>
      <div class="grow"><button class="gbtn" data-a="menu">${t("back")}</button><button class="gbtn primary" data-a="retry">${t("retry")}</button></div>`;
  }

  private roundHtml(round: Round): string {
    const t = this.t;
    const paused = this.audio.paused;
    const names = t("clues");
    const ctx: ClueContext = { band: round.band, album: round.album, masked: !round.done, t };
    const player = `<div class="gplay"><button class="pp ${paused ? "pulse" : ""}" data-a="pp" aria-label="${paused ? t("clipPlay") : t("clipPause")}">${paused ? ICONS.play : ICONS.pause}</button>
        <div class="gpm"><div class="glab"><span class="eq ${paused ? "" : "on"}" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="gst">${this.playLabel()}</span></div><div class="gbar"><i></i></div></div></div>`;
    // earlier clues stay visible in a compact list; when the round ends, every clue (the photo is shown big then)
    const listed = round.done
      ? round.order.filter((c) => c !== Clue.Photo)
      : round.order.slice(0, Math.max(0, round.shown - 1)).reverse();
    const past = listed.length
      ? `<div class="past"><div class="past-h">${round.done ? t("allT") : t("pastT")}</div>${listed
          .map((c) => `<div class="clue"><span>${names[c]}</span><div>${clueHtml(c, ctx, true)}</div></div>`)
          .join("")}</div>`
      : "";
    const head = this.header(t("round", this.roundNo, ROUNDS, this.score)) + player;
    return head + (round.done ? this.answerHtml(round, past) : this.playingHtml(round, ctx, past));
  }

  private playingHtml(round: Round, ctx: ClueContext, past: string): string {
    const t = this.t;
    const total = round.order.length;
    const current = round.shown ? round.order[round.shown - 1]! : null;
    const spotlight =
      current == null
        ? `<div class="spot-k"><span>${t("listenT")}</span></div><p class="spot-s">${t("listenS")}</p>`
        : `<div class="spot-k"><span>${t("clues")[current]}</span><span class="spot-n">${t("clueOf", round.shown, total)}</span></div>
           <div class="spot-v v${current}">${clueHtml(current, ctx)}</div>`;
    const pips = round.order.map((_, i) => `<i class="${i < round.shown ? "on" : ""}"></i>`).join("");
    const exhausted = round.shown >= total;
    return `<section class="spot ${round.fresh ? "enter" : ""}" aria-live="polite">${spotlight}
        <div class="spot-f"><span class="pips" aria-hidden="true">${pips}</span>
          <button class="gbtn reveal" data-a="reveal" ${exhausted ? "disabled" : ""}>${exhausted ? t("noMore") : t("reveal")}</button></div>
      </section>
      <div class="worth">${t("worth", MAX_POINTS - round.shown)}</div>
      ${round.wrong.length ? `<div class="wrong">${round.wrong.map((w) => `<s>${esc(w)}</s>`).join("")}</div>` : ""}
      <form class="gform" autocomplete="off"><input id="gq" placeholder="${t("guessPh")}" aria-label="${t("guessAl")}"><button class="gbtn primary">${t("guess")}</button></form>
      <ul class="sug" id="gsug"></ul>
      ${round.message ? `<p class="msg">${esc(round.message)}</p>` : ""}
      ${past}
      <div class="grow"><button class="gbtn ghost" data-a="giveup">${t("giveUp")}</button></div>`;
  }

  private answerHtml(round: Round, past: string): string {
    const t = this.t;
    const [id, name, slug] = round.band;
    const image = (src: string | null, cls: string, alt: string): string =>
      src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" referrerpolicy="no-referrer">` : "";
    const last = this.roundNo >= ROUNDS;
    return `<div class="answer">
        ${round.band[10] ? `<div class="alogo">${image(round.band[10], "glogo", t("logoOf", name))}</div>` : ""}
        ${image(round.band[7], "gband", t("bandPhotoOf", name))}
        <div class="ameta">${image(round.track.art, "gcover", t("coverOf", round.track.album))}
          <div class="atx"><a href="${bandUrl(id, name, slug)}" target="_blank" rel="noopener">${esc(name)}</a>
            <div class="pts ${round.points ? "ok" : "ko"}">${t("pts", round.points)}</div>
            <div class="song">“${esc(round.track.title)}” · ${esc(round.track.album)}</div></div></div></div>
      ${past}
      <div class="grow"><button class="gbtn ghost" data-a="menu">${t("quit")}</button><button class="gbtn primary" data-a="${last ? "end" : "next"}">${last ? t("finalBtn") : t("next")}</button></div>`;
  }

  private endHtml(): string {
    const t = this.t;
    const verdict = t("verdicts")[verdictIndex(this.score)];
    const rows = this.history
      .map(([n, p], i) => `<li><span>${i + 1}. ${esc(n)}</span><span>${p ? `+${p}` : "0"}</span></li>`)
      .join("");
    return (
      this.header(t("final")) +
      `<div class="gfinal">${this.score}<small> / ${ROUNDS * MAX_POINTS}</small></div><p class="gtx">${verdict}</p>
      <ol class="hist">${rows}</ol>
      <div class="grow"><button class="gbtn" data-a="menu">${t("changeLevel")}</button><button class="gbtn primary" data-a="start">${t("again")}</button></div>`
    );
  }
}
