/** The map's preview player: ▶ buttons next to band names and a small "now playing" bar. Never autoplays. */

import { type PreviewsFile, getJson, lazy } from "./data";
import { esc } from "./format";
import type { Translate } from "./i18n";
import { ICONS } from "./icons";
import { PreviewIndex, type Track, tracksFor } from "./itunes";

type ButtonState = "" | "busy" | "on" | "none";

export class PreviewPlayer {
  private readonly audio = new Audio();
  /** band id of the current band */
  private current: number | null = null;
  private name = "";
  private tracks: Track[] = [];
  private position = 0;
  private loadingId: number | null = null;
  /** band id -> tracks; [] = none found */
  private readonly cache = new Map<number, Track[]>();
  private readonly previews = lazy(async () => PreviewIndex.from(await getJson<PreviewsFile>("previews.json")));

  constructor(
    private readonly bar: HTMLElement,
    private readonly t: Translate,
  ) {
    this.audio.preload = "none";
    this.audio.volume = 0.8;
    document.addEventListener("click", (e) => this.onButtonClick(e), true);
    bar.addEventListener("click", (e) => this.onBarClick(e));
    for (const event of ["play", "pause"]) {
      this.audio.addEventListener(event, () => {
        if (this.tracks.length) this.renderBar();
        this.syncButtons();
      });
    }
    this.audio.addEventListener("ended", () => {
      if (this.position + 1 < this.tracks.length) this.play(this.position + 1);
      else {
        this.renderBar();
        this.syncButtons();
      }
    });
    this.audio.addEventListener("timeupdate", () => {
      const progress = this.bar.querySelector<HTMLElement>(".bar i");
      if (progress && this.audio.duration)
        progress.style.width = `${(100 * this.audio.currentTime) / this.audio.duration}%`;
    });
  }

  /** HTML of the ▶ button for a band. */
  button(name: string, bandId: number): string {
    const state = this.stateOf(bandId);
    const icon = state === "busy" ? ICONS.spinner : state === "on" ? ICONS.pause : ICONS.play;
    const label = state === "none" ? this.t("plNone") : state === "on" ? this.t("plPause") : this.t("plPlay");
    return `<button class="pl ${state}" data-n="${esc(name)}" data-id="${bandId}" title="${label}" aria-label="${label}: ${esc(name)}">${icon}</button>`;
  }

  stop(): void {
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.current = null;
    this.tracks = [];
    this.bar.hidden = true;
    this.syncButtons();
  }

  private stateOf(bandId: number): ButtonState {
    if (this.loadingId === bandId) return "busy";
    if (this.current === bandId && !this.audio.paused) return "on";
    return this.cache.get(bandId)?.length === 0 ? "none" : "";
  }

  private syncButtons(): void {
    document.querySelectorAll<HTMLElement>(".pl").forEach((b) => {
      b.outerHTML = this.button(b.dataset.n ?? "", Number(b.dataset.id));
    });
  }

  private onButtonClick(e: MouseEvent): void {
    const button = (e.target as Element | null)?.closest<HTMLElement>(".pl");
    if (!button || button.classList.contains("none")) return;
    e.preventDefault();
    e.stopPropagation();
    void this.toggle(button.dataset.n ?? "", Number(button.dataset.id));
  }

  private onBarClick(e: MouseEvent): void {
    const action = (e.target as Element | null)?.closest<HTMLElement>("[data-a]")?.dataset.a;
    if (action === "pp") this.togglePlayback();
    else if (action === "next") this.play((this.position + 1) % this.tracks.length);
    else if (action) this.stop();
  }

  private async toggle(name: string, bandId: number): Promise<void> {
    if (this.current === bandId && this.tracks.length) {
      this.togglePlayback();
      return;
    }
    if (this.loadingId != null) return;
    this.audio.pause();
    this.current = bandId;
    this.name = name;
    this.tracks = [];
    let tracks = this.cache.get(bandId);
    if (!tracks) {
      this.loadingId = bandId;
      this.syncButtons();
      try {
        const previews = await this.previews().catch(() => null);
        tracks = await tracksFor(name, bandId, previews);
        this.cache.set(bandId, tracks);
      } catch {
        tracks = undefined;
      }
      this.loadingId = null;
    }
    if (this.current !== bandId) return;
    if (!tracks) {
      this.renderBar(this.t("npUnavail"));
      this.syncButtons();
    } else if (!tracks.length) {
      this.renderBar(this.t("plNone"));
      this.syncButtons();
      setTimeout(() => {
        if (this.current === bandId && !this.tracks.length) {
          this.bar.hidden = true;
          this.current = null;
        }
      }, 3000);
    } else {
      this.tracks = tracks;
      this.play(0);
    }
  }

  private togglePlayback(): void {
    if (this.audio.paused) {
      this.audio.play().catch(() => this.renderBar(this.t("npBlocked")));
    } else {
      this.audio.pause();
    }
  }

  private play(position: number): void {
    this.position = position;
    this.audio.src = this.tracks[position]!.url;
    this.audio.play().catch(() => this.renderBar(this.t("npBlocked")));
    this.renderBar();
  }

  private renderBar(message?: string): void {
    const track = this.tracks[this.position];
    if (!track && !message) {
      this.bar.hidden = true;
      return;
    }
    const t = this.t;
    this.bar.innerHTML = message
      ? `<div class="tx" style="padding-left:8px"><b>${esc(this.name)}</b><span>${esc(message)}</span></div>
         <button data-a="x" aria-label="${t("npClose")}">${ICONS.close}</button>`
      : `<button data-a="pp" aria-label="${this.audio.paused ? t("npPlay") : t("npPause")}">${this.audio.paused ? ICONS.play : ICONS.pause}</button>
         <div class="tx"><b title="${esc(track!.title)}">${esc(track!.title)}</b><span>${esc(this.name)} · ${this.position + 1}/${this.tracks.length} · ${t("npVia")}</span></div>
         <button data-a="next" aria-label="${t("npNext")}" ${this.tracks.length > 1 ? "" : "disabled"}>${ICONS.next}</button>
         <button data-a="x" aria-label="${t("npStop")}">${ICONS.close}</button><div class="bar"><i></i></div>`;
    this.bar.hidden = false;
  }
}
