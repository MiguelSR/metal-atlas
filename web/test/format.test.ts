import { describe, expect, it } from "vitest";

import { bandUrl, esc, fold, highlight, numberFormatter, slugOf } from "../src/format";

describe("format", () => {
  it("escapes HTML", () => {
    expect(esc('<a href="x">R&B</a>')).toBe("&lt;a href=&quot;x&quot;&gt;R&amp;B&lt;/a&gt;");
    expect(esc(null)).toBe("");
    expect(esc(7)).toBe("7");
  });

  it("folds accents and case", () => {
    expect(fold("Motörhead")).toBe("motorhead");
    expect(fold("Mägo de Oz").length).toBe("Mägo de Oz".length);
  });

  it("builds Metal Archives band URLs", () => {
    expect(slugOf("Iron Maiden")).toBe("Iron_Maiden");
    expect(slugOf("Hear 'n Aid")).toBe("Hear_%27n_Aid");
    expect(bandUrl(84, "Yngwie Malmsteen", 0)).toBe("https://www.metal-archives.com/bands/Yngwie_Malmsteen/84");
    expect(bandUrl(2, "AC/DC", "AC%2FDC")).toBe("https://www.metal-archives.com/bands/AC%2FDC/2");
  });

  it("formats numbers per language", () => {
    expect(numberFormatter("es")(202692)).toBe("202.692");
    expect(numberFormatter("en")(202692)).toBe("202,692");
  });

  it("highlights the first match", () => {
    expect(highlight("Black Machete", "machete")).toBe("Black <mark>Machete</mark>");
    expect(highlight("Mayhem", "machete")).toBe("Mayhem");
    expect(highlight("A <b>", "")).toBe("A &lt;b&gt;");
  });
});
