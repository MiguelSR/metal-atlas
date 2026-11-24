/**
 * Builds the Oracle's example questions from the data: templates filled with real genres, countries, cities, themes,
 * bands and labels, kept only when the rules alone (no model) read them exactly as intended and the answer is
 * satisfying (enough bands, a lineup with members, albums…). Run by scripts/make-examples.mjs.
 */

import { countryNamer } from "../src/countries";
import { fold } from "../src/format";
import { type OracleFile, OracleIndex } from "../src/oracle/data";
import { type Answer, OracleEngine } from "../src/oracle/engine";
import type { Query } from "../src/oracle/query";
import { refine } from "../src/oracle/refine";
import { themeOf } from "../src/oracle/themes";
import { mismatches } from "./compare";

type Lang = "es" | "en";
interface Candidate {
  template: string;
  question: string;
  expected: Query;
}

/** [Spanish, English, genre words] */
const GENRES: [string, string, string[]][] = [
  ["death metal", "death metal", ["death"]],
  ["black metal", "black metal", ["black"]],
  ["thrash", "thrash", ["thrash"]],
  ["doom metal", "doom metal", ["doom"]],
  ["power metal", "power metal", ["power"]],
  ["heavy metal", "heavy metal", ["heavy"]],
  ["speed metal", "speed metal", ["speed"]],
  ["folk metal", "folk metal", ["folk"]],
  ["gothic metal", "gothic metal", ["gothic"]],
  ["sludge", "sludge", ["sludge"]],
  ["stoner", "stoner", ["stoner"]],
  ["grindcore", "grindcore", ["grindcore"]],
  ["metal progresivo", "progressive metal", ["progressive"]],
  ["metal sinfónico", "symphonic metal", ["symphonic"]],
  ["death melódico", "melodic death metal", ["melodic", "death"]],
  ["viking metal", "viking metal", ["viking"]],
  ["pagan metal", "pagan metal", ["pagan"]],
  ["death técnico", "technical death metal", ["technical", "death"]],
  ["metal industrial", "industrial metal", ["industrial"]],
  ["groove metal", "groove metal", ["groove"]],
  ["metalcore", "metalcore", ["metalcore"]],
  ["deathcore", "deathcore", ["deathcore"]],
  ["black atmosférico", "atmospheric black metal", ["atmospheric", "black"]],
  ["funeral doom", "funeral doom", ["funeral", "doom"]],
  ["brutal death", "brutal death metal", ["brutal", "death"]],
  ["crust", "crust", ["crust"]],
];

/** [Spanish, English] theme words; the query gets `themeOf` of each (its concept) */
const THEMES: [string, string][] = [
  ["la guerra", "war"],
  ["Satanás", "Satan"],
  ["la muerte", "death"],
  ["el ocultismo", "occultism"],
  ["vikingos", "vikings"],
  ["Tolkien", "Tolkien"],
  ["Lovecraft", "Lovecraft"],
  ["la historia", "history"],
  ["la naturaleza", "nature"],
  ["fantasía", "fantasy"],
  ["el espacio", "space"],
  ["terror", "horror"],
  ["política", "politics"],
  ["religión", "religion"],
  ["cristianismo", "Christianity"],
  ["paganismo", "paganism"],
  ["la depresión", "depression"],
  ["el suicidio", "suicide"],
  ["el odio", "hatred"],
  ["el amor", "love"],
  ["cerveza", "beer"],
  ["zombis", "zombies"],
  ["gore", "gore"],
  ["brujería", "witchcraft"],
  ["vampiros", "vampires"],
  ["dragones", "dragons"],
  ["piratas", "pirates"],
  ["el invierno", "winter"],
  ["la oscuridad", "darkness"],
  ["el apocalipsis", "apocalypse"],
  ["nihilismo", "nihilism"],
  ["misantropía", "misanthropy"],
  ["mitología", "mythology"],
  ["la locura", "madness"],
];

const DECADES = [1970, 1980, 1990, 2000, 2010];
const ROLES: [es: string, en: string, role: string, needle: string][] = [
  ["¿Quién toca la batería en", "Who plays drums in", "drums", "drum"],
  ["¿Quién canta en", "Who sings in", "vocals", "vocal"],
  ["¿Quién toca el bajo en", "Who plays bass in", "bass", "bass"],
  ["¿Quién es el guitarrista de", "Who is the guitarist of", "guitars", "guitar"],
];

/** A deterministic pseudo-random generator, so the examples only change when the data does. */
function random(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

function shuffle<T>(items: T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const decadeEs = (d: number): string => `los ${String(d).slice(2)}`;
const decadeEn = (d: number): string => `the ${d}s`;

function satisfying(answer: Answer, query: Query): boolean {
  switch (answer.kind) {
    case "bands":
    case "count":
      return answer.total >= 3 && answer.rows.length >= Math.min(3, query.limit ?? 3);
    case "top":
      return answer.groups.length >= 3;
    case "lineup":
      return answer.lineups.length > 0 && answer.lineups[0]!.members.length > 0;
    case "albums":
      return answer.albums.length >= (query.limit === 1 ? 1 : 3);
    default:
      return false;
  }
}

/** `debug`: also report every rejected question (misread, or with an unsatisfying answer). */
export function makeExamples(
  file: OracleFile,
  debug = false,
  perTemplate = 30,
): Record<Lang, string[]> & { report: string[] } {
  const index = new OracleIndex(file);
  const engine = new OracleEngine(index);
  const { data } = index;
  const next = random(42);
  const spanishName = countryNamer("es", "Internacional");
  const englishName = countryNamer("en", "International");

  // countries with many bands, and their biggest cities
  const perCountry = new Map<number, number>();
  for (const cs of data.country) for (const c of cs) perCountry.set(c, (perCountry.get(c) ?? 0) + 1);
  const countries = [...perCountry]
    .filter(([c, n]) => n >= 400 && !["International", "Unknown"].includes(data.countries[c]!))
    .map(([c]) => data.countries[c]!);
  const perCity = new Map<string, number>();
  data.location.forEach((loc, row) => {
    if (loc < 0 || data.country[row]!.length !== 1) return;
    const city = data.dicts.location[loc]!.split(/[,;(/]/)[0]!.trim();
    if (/^[\p{Lu}][\p{L}' -]+$/u.test(city)) perCity.set(city, (perCity.get(city) ?? 0) + 1);
  });
  const cities = [...perCity].filter(([, n]) => n >= 60).map(([city]) => city);
  // bands with a lineup and albums, the best known first, with a unique, capitalized name
  const nameCount = new Map<string, number>();
  for (const name of data.name) nameCount.set(fold(name), (nameCount.get(fold(name)) ?? 0) + 1);
  const bands: number[] = [];
  for (let row = 0; row < data.id.length && bands.length < 600; row++) {
    const name = data.name[row]!;
    if (index.lineup(row) && index.albums(row) && nameCount.get(fold(name)) === 1 && /^[\p{Lu}\p{N}]/u.test(name)) {
      if (!/\b(metal|death|black|doom|thrash|heavy|power|speed|folk|de|of|in)\b/i.test(name)) bands.push(row);
    }
  }
  const labelSize = new Map<number, number>();
  for (const l of data.label) if (l >= 0) labelSize.set(l, (labelSize.get(l) ?? 0) + 1);
  const labels = [...labelSize]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80)
    .map(([l]) => data.dicts.label[l]!)
    .filter((label) => /^[\p{Lu}\p{N}]/u.test(label));

  const pick = <T>(items: T[]): T => items[Math.floor(next() * items.length)]!;
  const candidates: Record<Lang, Candidate[]> = { es: [], en: [] };
  const add = (template: string, es: string, en: string, expected: Query, expectedEn: Query = expected): void => {
    candidates.es.push({ template, question: es, expected });
    candidates.en.push({ template, question: en, expected: expectedEn });
  };

  for (let i = 0; i < perTemplate * 3; i++) {
    const [gEs, gEn, genre] = pick(GENRES);
    const country = pick(countries);
    const cEs = spanishName(country);
    const cEn = englishName(country);
    const city = pick(cities);
    const decade = pick(DECADES);
    const [tEs, tEn] = pick(THEMES);
    const band = data.name[pick(bands)]!;
    const label = pick(labels);
    const years = { formedFrom: decade, formedTo: decade + 9 };
    const role = pick(ROLES);

    add("genre-country", `Bandas de ${gEs} de ${cEs}`, `${cap(gEn)} bands from ${cEn}`, {
      intent: "bands",
      genre,
      country,
    });
    add("count", `¿Cuántas bandas de ${gEs} hay en ${cEs}?`, `How many ${gEn} bands are there in ${cEn}?`, {
      intent: "count",
      genre,
      country,
    });
    add("top-country", `¿Qué país tiene más bandas de ${gEs}?`, `Which country has the most ${gEn} bands?`, {
      intent: "top",
      groupBy: "country",
      genre,
    });
    add("genre-city", `Bandas de ${gEs} de ${city}`, `${cap(gEn)} bands from ${city}`, {
      intent: "bands",
      genre,
      location: city,
    });
    add(
      "genre-country-decade",
      `Bandas de ${gEs} de ${cEs} formadas en ${decadeEs(decade)}`,
      `${cap(gEn)} bands from ${cEn} formed in ${decadeEn(decade)}`,
      { intent: "bands", genre, country, ...years },
    );
    add("oldest", `Las bandas de ${gEs} más antiguas de ${cEs}`, `The oldest ${gEn} bands from ${cEn}`, {
      intent: "bands",
      genre,
      country,
      sort: "oldest",
    });
    add("best", `Las mejores bandas de ${gEs} de ${cEs}`, `The best rated ${gEn} bands from ${cEn}`, {
      intent: "bands",
      genre,
      country,
      sort: "rating",
    });
    add("reviews", `Las bandas de ${gEs} con más reseñas`, `The most reviewed ${gEn} bands`, {
      intent: "bands",
      genre,
      sort: "reviews",
    });
    add("active", `Bandas de ${gEs} de ${cEs} que sigan activas`, `Active ${gEn} bands from ${cEn}`, {
      intent: "bands",
      genre,
      country,
      status: "Active",
    });
    add(
      "theme",
      `Bandas que hablen de ${tEs}`,
      `Bands that sing about ${tEn}`,
      { intent: "bands", themes: [themeOf(tEs)] },
      {
        intent: "bands",
        themes: [themeOf(tEn)],
      },
    );
    add(
      "genre-theme",
      `Bandas de ${gEs} que hablen de ${tEs}`,
      `${cap(gEn)} bands that sing about ${tEn}`,
      { intent: "bands", genre, themes: [themeOf(tEs)] },
      { intent: "bands", genre, themes: [themeOf(tEn)] },
    );
    add("labels", `Los sellos con más bandas de ${gEs} en ${cEs}`, `The labels with the most ${gEn} bands in ${cEn}`, {
      intent: "top",
      groupBy: "label",
      genre,
      country,
    });
    add(
      "decade",
      `¿En qué década se formaron más bandas de ${gEs}?`,
      `Which decade had the most ${gEn} bands formed?`,
      {
        intent: "top",
        groupBy: "decade",
        genre,
      },
    );
    add(
      "cities",
      `¿Qué ciudades de ${cEs} tienen más bandas de ${gEs}?`,
      `Which cities in ${cEn} have the most ${gEn} bands?`,
      {
        intent: "top",
        groupBy: "location",
        genre,
        country,
      },
    );
    add("role", `${role[0]} ${band}?`, `${role[1]} ${band}?`, { intent: "lineup", band, role: role[2] });
    add("members", `Miembros de ${band}`, `${band} members`, { intent: "lineup", band });
    add("first", `Primer disco de ${band}`, `${band}'s first album`, {
      intent: "albums",
      band,
      sort: "oldest",
      limit: 1,
      albumType: "Full-length",
    });
    add("last", `Último disco de ${band}`, `${band}'s latest album`, {
      intent: "albums",
      band,
      sort: "newest",
      limit: 1,
      albumType: "Full-length",
    });
    add("discography", `Discografía de ${band}`, `${band} discography`, { intent: "albums", band });
    add("label", `Bandas del sello ${label}`, `Bands on the label ${label}`, { intent: "bands", label });
  }

  const report: string[] = [];
  const result = { es: [] as string[], en: [] as string[], report };
  for (const lang of ["es", "en"] as const) {
    const kept = new Map<string, string[]>();
    let rejected = 0;
    for (const { template, question, expected } of candidates[lang]) {
      const list = kept.get(template) ?? [];
      kept.set(template, list);
      if (list.length >= perTemplate || list.includes(question)) continue;
      const query = refine(question, { intent: "bands" }, index);
      const extra = Object.keys(query).filter((k) => !(k in expected));
      if (extra.length || mismatches(query, expected).length) {
        rejected++;
        if (debug) report.push(`  ✗ ${question} -> ${JSON.stringify(query)}`);
        continue;
      }
      if (!satisfying(engine.run(query).answer, query)) {
        rejected++;
        if (debug) report.push(`  ∅ ${question}`);
        continue;
      }
      list.push(question);
    }
    result[lang] = shuffle([...kept.values()].flat(), next);
    report.push(
      `${lang}: ${result[lang].length} kept, ${rejected} rejected; per template: ${[...kept].map(([t, l]) => `${t} ${l.length}`).join(", ")}`,
    );
  }
  return result;
}

const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
