/** Links to Metal Archives' advanced band search with the map's filters. */

/** Grouped regions with local names -> the English names Metal Archives uses in band locations. */
export const REGION_NAMES_EN: Record<string, string> = {
  Cataluña: "Catalonia",
  Andalucía: "Andalusia",
  "País Vasco": "Basque Country",
  "Foral de Navarra": "Navarre",
  Aragón: "Aragon",
  "Castilla y León": "Castile and León",
  "Castilla-La Mancha": "Castile-La Mancha",
  Valenciana: "Valencia",
  "Canary Is.": "Canary Islands",
  "Islas Baleares": "Balearic Islands",
  Piemonte: "Piedmont",
  Lombardia: "Lombardy",
  "Trentino-Alto Adige": "Trentino",
  Toscana: "Tuscany",
  Sardegna: "Sardinia",
  "Valle d'Aosta": "Aosta",
  "Friuli-Venezia Giulia": "Friuli",
  Bretagne: "Brittany",
  Normandie: "Normandy",
  Corse: "Corsica",
  "Guyane française": "French Guiana",
};

/** Countries whose regions are statistical areas that never appear in band locations. */
export const NO_REGION_SEARCH = new Set(["United Kingdom", "Slovenia"]);

export interface SearchFilters {
  country: string;
  countryCode: string | null;
  region?: string | null;
  genre?: string | null;
  bandName?: string;
  from?: number | null;
  to?: number | null;
  activeOnly?: boolean;
}

/** The search URL, or null when the filters can't be expressed (no country code, or a statistical region). */
export function searchUrl(f: SearchFilters): string | null {
  if (!f.countryCode) return null;
  let location = "";
  if (f.region != null) {
    if (NO_REGION_SEARCH.has(f.country)) return null;
    location = (REGION_NAMES_EN[f.region] ?? f.region).replace(/\s*\(.*?\)\s*/g, " ").trim();
  }
  const params = new URLSearchParams({
    bandName: f.bandName ?? "",
    genre: f.genre ?? "",
    "country[]": f.countryCode,
    location,
    yearCreationFrom: f.from?.toString() ?? "",
    yearCreationTo: f.to?.toString() ?? "",
  });
  if (f.activeOnly) params.append("status[]", "1");
  return "https://www.metal-archives.com/search/advanced/searching/bands?" + params.toString();
}
