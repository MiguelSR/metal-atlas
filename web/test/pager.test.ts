import { describe, expect, it } from "vitest";

import { pageSlice, pagerHtml } from "../src/map/pager";

const text = { range: (a: string, b: string, n: string) => `${a}-${b}/${n}`, prev: "prev", next: "next" };

describe("pageSlice", () => {
  it("slices pages of ten and clamps out-of-range pages", () => {
    expect(pageSlice(0, 25)).toEqual({ page: 0, start: 0, end: 10 });
    expect(pageSlice(2, 25)).toEqual({ page: 2, start: 20, end: 25 });
    expect(pageSlice(9, 25)).toEqual({ page: 2, start: 20, end: 25 });
    expect(pageSlice(-1, 25)).toEqual({ page: 0, start: 0, end: 10 });
    expect(pageSlice(0, 0)).toEqual({ page: 0, start: 0, end: 0 });
  });
});

describe("pagerHtml", () => {
  it("is empty when everything fits", () => {
    expect(pagerHtml(0, 7, 7, text, String)).toBe("");
  });
  it("shows the range and disables the ends", () => {
    const first = pagerHtml(0, 10, 25, text, String);
    expect(first).toContain("1-10/25");
    expect(first).toMatch(/data-page="-1"[^>]*disabled/);
    expect(first).not.toMatch(/data-page="1"[^>]*disabled/);
    expect(pagerHtml(20, 25, 25, text, String)).toMatch(/data-page="1"[^>]*disabled/);
  });
});
