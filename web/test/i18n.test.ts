import { describe, expect, it } from "vitest";

import { detectLang, messages, translator } from "../src/i18n";

const nf = (n: number): string => String(n);

describe("i18n", () => {
  it("prefers the saved language, then the browser's", () => {
    expect(detectLang("es", ["en-US"])).toBe("es");
    expect(detectLang(null, ["fr-FR", "es-ES", "en"])).toBe("es");
    expect(detectLang("de", ["de-DE"])).toBe("en");
  });

  it("translates texts and formats with arguments", () => {
    const en = translator("en", nf);
    const es = translator("es", nf);
    expect(en("bands", 1)).toBe("1 band");
    expect(es("bands", 2)).toBe("2 bandas");
    expect(es("round", 3, 10, 12)).toBe("Ronda <b>3</b>/10 · Puntos <b>12</b>");
    expect(en("levels")).toHaveLength(5);
  });

  it("has every message in both languages with the same shape", () => {
    const en = messages("en", nf);
    const es = messages("es", nf);
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(typeof es[key], key).toBe(typeof en[key]);
      if (Array.isArray(en[key])) expect((es[key] as unknown[]).length, key).toBe((en[key] as unknown[]).length);
    }
  });

  it("translates lineup headers in Spanish", () => {
    const es = translator("es", nf);
    expect(es("lineupHdr", "Last known")).toBe("(última formación conocida)");
    expect(es("lineupHdr", "Past")).toBe("(antiguos miembros)");
  });
});
