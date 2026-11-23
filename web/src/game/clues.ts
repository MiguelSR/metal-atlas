/** The HTML of each clue. */

import type { GameRow } from "../data";
import { esc } from "../format";
import type { Translate } from "../i18n";
import { Clue, maskName } from "./rules";

export interface ClueContext {
  band: GameRow;
  album: string;
  /** hide the band's name (until the round ends) */
  masked: boolean;
  t: Translate;
}

export function clueHtml(clue: Clue, ctx: ClueContext, compact = false): string {
  const { band, t } = ctx;
  const hide = (text: string): string => (ctx.masked ? maskName(text, band[1], t("selfTitled")) : text);
  switch (clue) {
    case Clue.Origin: {
      // city / area + country: the country alone is often too obvious
      const location = (band[14] ?? "").trim();
      return location ? `${esc(hide(location))} <small>· ${esc(band[4])}</small>` : esc(band[4]);
    }
    case Clue.Formed:
      return String(band[3]);
    case Clue.Review:
      return `<q class="rq">${esc(hide(band[8] ?? ""))}</q>${band[9] != null ? ` <small>· ${t("reviewFrom", band[9])}</small>` : ""}`;
    case Clue.Lineup: {
      const members = band[5]
        .map(
          ([name, role]) =>
            `<span class="mem">${esc(hide(name))}${role ? ` <small>· ${esc(role)}</small>` : ""}</span>`,
        )
        .join(compact ? "" : "<br>");
      const header = band[6] && !/^current/i.test(band[6]) ? `<br><small>${esc(t("lineupHdr", band[6]))}</small>` : "";
      return members + header;
    }
    case Clue.Album:
      return `<i>${esc(hide(ctx.album))}</i>`;
    case Clue.Photo:
      return `<img class="gph" src="${esc(band[7])}" alt="${t("bandPhoto")}" referrerpolicy="no-referrer" loading="lazy" data-fallback="${esc(t("photoNa"))}">`;
  }
}
