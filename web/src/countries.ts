/** Country names: Metal Archives' names, the world map's names and names in the viewer's language. */

/** Metal Archives country name -> name in the world-atlas TopoJSON */
export const WORLD_ATLAS_NAMES: Record<string, string> = {
  "United States": "United States of America",
  "Korea, South": "South Korea",
  Türkiye: "Turkey",
  "Bosnia and Herzegovina": "Bosnia and Herz.",
  "North Macedonia": "Macedonia",
  "Dominican Republic": "Dominican Rep.",
  "East Timor": "Timor-Leste",
  "Falkland Islands": "Falkland Is.",
  "Faroe Islands": "Faeroe Is.",
  "French Polynesia": "Fr. Polynesia",
  "Åland Islands": "Åland",
  "Saint Pierre and Miquelon": "St. Pierre and Miquelon",
};

export const atlasName = (country: string): string => WORLD_ATLAS_NAMES[country] ?? country;

/**
 * English country name -> name in `lang`, built from Intl.DisplayNames (which knows regions by ISO code), with the
 * spellings Metal Archives uses ("Bosnia and Herzegovina" vs "Bosnia & Herzegovina", "Myanmar" vs "Myanmar (Burma)"…).
 */
export function localCountryNames(lang: string): Record<string, string> {
  if (lang === "en" || typeof Intl === "undefined" || !("DisplayNames" in Intl)) return {};
  const english = new Intl.DisplayNames(["en"], { type: "region" });
  const local = new Intl.DisplayNames([lang], { type: "region" });
  const names: Record<string, string> = {};
  for (let a = 65; a < 91; a++) {
    for (let b = 65; b < 91; b++) {
      const code = String.fromCharCode(a, b);
      try {
        const name = english.of(code);
        const translated = local.of(code);
        if (!name || name === code || !translated) continue;
        const spelled = name.replace(/ & /g, " and ");
        for (const variant of [name, spelled, spelled.replace(/\s*\(.*\)/, ""), spelled.replace(/^St\. /, "Saint ")]) {
          names[variant] ??= translated;
        }
      } catch {
        // not a region code
      }
    }
  }
  const byCode = (code: string): string | undefined => local.of(code);
  return {
    ...names,
    "South Korea": names["South Korea"] ?? byCode("KR") ?? "South Korea",
    "East Timor": byCode("TL") ?? "East Timor",
    "Saint Pierre and Miquelon": byCode("PM") ?? "Saint Pierre and Miquelon",
    Türkiye: byCode("TR") ?? "Türkiye",
    Turkey: byCode("TR") ?? "Turkey",
    Czechia: byCode("CZ") ?? "Czechia",
    "Ivory Coast": byCode("CI") ?? "Ivory Coast",
    Unknown: lang === "es" ? "Desconocido" : "Unknown",
  };
}

/** A function giving the display name of a Metal Archives country in the viewer's language. */
export function countryNamer(lang: string, international: string): (country: string) => string {
  const display: Record<string, string> = { "Korea, South": "South Korea", International: international };
  const local = localCountryNames(lang);
  return (country) => {
    const shown = display[country] ?? country;
    return local[shown] ?? shown;
  };
}
