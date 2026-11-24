/** Pages of a long list in the map card: "‹ 11–20 of 345 ›". */

import { esc } from "../format";

export const PAGE_SIZE = 10;

/** The page clamped into range, and the slice [start, end) it shows. */
export function pageSlice(page: number, total: number, size = PAGE_SIZE): { page: number; start: number; end: number } {
  const last = Math.max(0, Math.ceil(total / size) - 1);
  const p = Math.min(Math.max(0, page), last);
  return { page: p, start: p * size, end: Math.min(total, (p + 1) * size) };
}

export interface PagerText {
  range: (from: string, to: string, total: string) => string;
  prev: string;
  next: string;
}

/** The pager's HTML, or nothing when everything fits on one page. */
export function pagerHtml(
  start: number,
  end: number,
  total: number,
  text: PagerText,
  nf: (n: number) => string,
): string {
  if (total <= end - start) return "";
  return `<div class="pager"><button data-page="-1" aria-label="${esc(text.prev)}" title="${esc(text.prev)}"${start === 0 ? " disabled" : ""}>‹</button>
    <span>${text.range(nf(start + 1), nf(end), nf(total))}</span>
    <button data-page="1" aria-label="${esc(text.next)}" title="${esc(text.next)}"${end >= total ? " disabled" : ""}>›</button></div>`;
}
