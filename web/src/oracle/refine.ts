/**
 * Corrects the model's query with what the question itself says.
 *
 * The in-browser models are small: they translate names and paraphrases well but invent filters nobody asked for
 * (a country, a genre, a sort) and miss plain cues ("in the 80s", "how many", "the oldest"). So the question has the
 * last word: explicit cues (years, status, sort, counts, rankings, lineups, albums, what the data can't answer) are
 * read with rules, and what the model adds is kept only if the question backs it.
 */

import { fold } from "../format";
import type { AlbumType, Group, Missing, Query, Sort, Status } from "./query";

/** What the rules need to know about the data. Names are folded (see `fold`). */
export interface Vocabulary {
  isBand(name: string): boolean;
  isLabel(name: string): boolean;
  /** The Metal Archives name of a country named in English, Spanish or a common alias; null if it isn't one. */
  country(name: string): string | null;
}

/** Genre words worth filtering on, with Spanish spellings mapped to the English Metal Archives uses. */
const GENRE_WORDS = new Set(
  (
    "death black thrash doom heavy power speed folk melodic progressive gothic sludge stoner grindcore grind groove " +
    "symphonic industrial metalcore deathcore hardcore crust punk crossover technical atmospheric experimental brutal " +
    "blackened ambient drone funeral viking pagan epic depressive neoclassical djent goregrind avant-garde nu-metal " +
    "post-metal post-black shoegaze powerviolence mathcore slam noise dungeon synth medieval southern raw"
  ).split(" "),
);
const GENRE_SYNONYMS: Record<string, string> = {
  melodico: "melodic",
  progresivo: "progressive",
  gotico: "gothic",
  sinfonico: "symphonic",
  tecnico: "technical",
  atmosferico: "atmospheric",
  experimental: "experimental",
  epico: "epic",
  vikingo: "viking",
  pagano: "pagan",
  depresivo: "depressive",
  neoclasico: "neoclassical",
  progressive: "progressive",
  prog: "progressive",
  grind: "grind",
};

/** Spanish (and local) place names -> the spelling in Metal Archives locations. */
const PLACES: Record<string, string> = {
  sevilla: "Seville",
  gotemburgo: "Gothenburg",
  goteborg: "Gothenburg",
  estocolmo: "Stockholm",
  londres: "London",
  "nueva york": "New York",
  "nueva jersey": "New Jersey",
  "nueva orleans": "New Orleans",
  munich: "Munich",
  colonia: "Cologne",
  atenas: "Athens",
  varsovia: "Warsaw",
  cataluna: "Catalonia",
  andalucia: "Andalusia",
  "pais vasco": "Basque Country",
  baviera: "Bavaria",
  escocia: "Scotland",
  inglaterra: "England",
  gales: "Wales",
  tejas: "Texas",
  "bay area": "Bay Area",
  "area de la bahia": "Bay Area",
  helsinki: "Helsinki",
  bergen: "Bergen",
  oslo: "Oslo",
  tampa: "Tampa",
  florida: "Florida",
  california: "California",
  texas: "Texas",
};

/** Adjectives of nationality (folded stems, matched at the start of a word) -> Metal Archives country. */
const DEMONYMS: [stem: string, country: string][] = [
  ["espanol", "Spain"],
  ["spanish", "Spain"],
  ["suec", "Sweden"],
  ["swedish", "Sweden"],
  ["finland", "Finland"],
  ["finnish", "Finland"],
  ["norueg", "Norway"],
  ["norwegian", "Norway"],
  ["aleman", "Germany"],
  ["german", "Germany"],
  ["estadounidense", "United States"],
  ["american", "United States"],
  ["norteamerican", "United States"],
  ["britanic", "United Kingdom"],
  ["british", "United Kingdom"],
  ["ingles", "United Kingdom"],
  ["english", "United Kingdom"],
  ["escoces", "United Kingdom"],
  ["scottish", "United Kingdom"],
  ["japones", "Japan"],
  ["japanese", "Japan"],
  ["brasilen", "Brazil"],
  ["brazilian", "Brazil"],
  ["frances", "France"],
  ["french", "France"],
  ["italian", "Italy"],
  ["grieg", "Greece"],
  ["greek", "Greece"],
  ["polac", "Poland"],
  ["polish", "Poland"],
  ["mexican", "Mexico"],
  ["argentin", "Argentina"],
  ["chilen", "Chile"],
  ["chilean", "Chile"],
  ["colombian", "Colombia"],
  ["canadiense", "Canada"],
  ["canadian", "Canada"],
  ["australian", "Australia"],
  ["holandes", "Netherlands"],
  ["neerlandes", "Netherlands"],
  ["dutch", "Netherlands"],
  ["belga", "Belgium"],
  ["belgian", "Belgium"],
  ["suiz", "Switzerland"],
  ["swiss", "Switzerland"],
  ["austriac", "Austria"],
  ["austrian", "Austria"],
  ["portugues", "Portugal"],
  ["portuguese", "Portugal"],
  ["checo", "Czechia"],
  ["checa", "Czechia"],
  ["czech", "Czechia"],
  ["danes", "Denmark"],
  ["danish", "Denmark"],
  ["islandes", "Iceland"],
  ["icelandic", "Iceland"],
  ["peruan", "Peru"],
  ["peruvian", "Peru"],
  ["ucranian", "Ukraine"],
  ["ukrainian", "Ukraine"],
  ["irlandes", "Ireland"],
  ["irish", "Ireland"],
  ["hungar", "Hungary"],
  ["turco", "Türkiye"],
  ["turca", "Türkiye"],
  ["turkish", "Türkiye"],
  ["indonesi", "Indonesia"],
  ["russian", "Russia"],
];
const RUSSIAN = new Set(["ruso", "rusa", "rusos", "rusas"]);

/** Spanish words for common lyrical themes (folded stems) -> the English stem Metal Archives uses. */
const THEME_WORDS: [stem: string, english: string][] = [
  ["satan", "satan"],
  ["guerra", "war"],
  ["belic", "war"],
  ["muerte", "death"],
  ["ocult", "occult"],
  ["mitolog", "mytholog"],
  ["viking", "viking"],
  ["odio", "hate"],
  ["dolor", "pain"],
  ["depresi", "depression"],
  ["suicid", "suicide"],
  ["naturaleza", "nature"],
  ["pagan", "pagan"],
  ["histori", "history"],
  ["fantasia", "fantasy"],
  ["espacio", "space"],
  ["terror", "horror"],
  ["politic", "politic"],
  ["religi", "religion"],
  ["anticristian", "anti-christian"],
  ["misantrop", "misanthrop"],
  ["tristeza", "sadness"],
  ["soledad", "loneliness"],
  ["amor", "love"],
  ["cerveza", "beer"],
  ["zombi", "zombie"],
  ["apocalip", "apocalyp"],
  ["nihilis", "nihilism"],
  ["oscuridad", "darkness"],
  ["invierno", "winter"],
  ["bosque", "forest"],
  ["pirata", "pirate"],
  ["demoni", "demon"],
  ["bruj", "witch"],
  ["vampir", "vampire"],
  ["magia", "magic"],
  ["esoteri", "esoteric"],
  ["filosof", "philosoph"],
  ["existencial", "existential"],
  ["dragon", "dragon"],
  ["medieval", "medieval"],
  ["cienci", "science"],
  ["eslav", "slavic"],
  ["celta", "celtic"],
  ["nordic", "norse"],
  ["nordica", "norse"],
  ["exterior", "space"],
  ["universo", "universe"],
  ["cosmo", "cosm"],
];

/** A theme word in the English Metal Archives uses: Spanish common themes translated, others kept. */
export function themeWord(word: string): string {
  const folded = fold(word);
  return THEME_WORDS.find(([stem]) => folded.startsWith(stem))?.[1] ?? folded;
}

const ROLES: [RegExp, string][] = [
  [/\b(canta|cantan|cantante|vocalista|voz|sings?|singer|vocals?|vocalist)\b/, "vocals"],
  [/\b(guitarra|guitarrista|guitarras|guitars?|guitarist)\b/, "guitars"],
  [/\b(bajo|bajista|bass|bassist)\b/, "bass"],
  [/\b(bateria|baterista|bateras?|drums?|drummer)\b/, "drums"],
  [/\b(teclados?|teclista|keyboards?|keyboardist)\b/, "keyboards"],
];

/** Words that start questions or name things generically: never the start of a band, label or album name. */
const NOT_A_NAME = new Set(
  (
    "bandas grupos banda grupo discos disco discografia miembros integrantes eps ep demos album albumes que quien " +
    "cual cuales cuantas cuantos como donde los las el la de del en y bands band albums album members who what " +
    "which how the of in and lineup ultimo primer mejores mejor"
  ).split(" "),
);
const CONNECTORS = new Set(["of", "the", "in", "and", "de", "del", "la", "el", "los", "las", "y", "a", "to", "n'"]);

const UNSUPPORTED: [RegExp, Missing][] = [
  [
    /(dice|dicen|says?|palabra|words?)\b.*\b(letras?|lyrics)|\b(letras?|lyrics)\b.*\b(dice|dicen|says?|palabra|words?|mas veces|most times)/,
    "lyrics",
  ],
  [
    /parecid|similar|suenan? como|sounds? like|\bfans de\b|\bfans of\b|escuchan|listen to|recomiend|recommend/,
    "similar",
  ],
  [/portada|caratula|cover art|artwork|album cover/, "covers"],
  [/\bcancion|\bsongs?\b|\btracks?\b|\bduracion\b/, "tracks"],
  [
    /\b(primer|primera|segundo|segunda|tercer|tercera|cuarto|first|second|third|fourth|former|antiguos?|ex|previous|anterior(es)?|original(es)?)\b.{0,12}\b(guitarr\w*|bajista|bateria|batera|baterista|cantante|vocalista|teclista|miembros?|integrantes?|guitarists?|bassists?|drummers?|singers?|vocalists?|members?|lineup|formacion)/,
    "past_members",
  ],
];

const GROUP_WORDS: [RegExp, Group][] = [
  [/^(pais|paises|countr\w*|nacion\w*)$/, "country"],
  [/^(ciudad\w*|cit(y|ies)|region\w*|estados?|states?|provincias?|zonas?)$/, "location"],
  [/^(sellos?|labels?|discograficas?)$/, "label"],
  [/^(generos?|genres?|estilos?|styles?)$/, "genre"],
  [/^(anos?|years?)$/, "year"],
  [/^(decadas?|decades?)$/, "decade"],
];

const SORTS: [RegExp, Sort][] = [
  [/mas antigu|oldest|earliest|veteran|pioner|pioneer/, "oldest"],
  [/mas (nuev|recient|joven)|newest|youngest|latest|\bultim|most recent|\blast\b/, "newest"],
  [/\bmejor|\bbest\b|top rated|highest rated|valorad|puntuad/, "rating"],
  [/mas rese|most review|mas popular|most popular|mas conocid|best known|famos|famous/, "reviews"],
];

const STATUS_CUES: [RegExp, Status][] = [
  [
    /separad|\bsplit\b|split-up|disuelt|ya no existen|desaparecid|inactiv|defunct|broke up|disbanded|no longer/,
    "Split-up",
  ],
  [/en pausa|on hold|paron/, "On hold"],
  [/\bactiv|\bactive\b|siguen|still/, "Active"],
];

const ALBUM_TYPES: [RegExp, AlbumType][] = [
  [/\beps?\b/, "EP"],
  [/\bdemos?\b/, "Demo"],
  [/\bsingles?\b|\bsencillos?\b/, "Single"],
  [/en directo|en vivo|\blive\b/, "Live album"],
  [/recopilatori|compilation/, "Compilation"],
  [/\bsplits?\b/, "Split"],
  [/de estudio|full-length|larga duracion|\blps?\b/, "Full-length"],
];

const words = (folded: string): string[] => folded.split(/[^\p{L}\p{N}'-]+/u).filter(Boolean);

/** Two-digit decade -> its first year: "80" -> 1980, "10" -> 2010. */
const century = (digits: string): number => {
  const n = Number(digits);
  return digits.length === 4 ? n : n >= 50 ? 1900 + n : 2000 + n;
};

/** Years named in the question: a decade, a single year, a range, "after"/"before". */
export function yearsIn(q: string): { from?: number; to?: number } | null {
  let m =
    /(?:entre|between)\s+(?:el\s+)?(\d{4})\s+(?:y|and)\s+(?:el\s+)?(\d{4})/.exec(q) ??
    /\b(\d{4})\s*[-–]\s*(\d{4})\b/.exec(q);
  if (m) return { from: Number(m[1]), to: Number(m[2]) };
  m =
    /(?:los|las|anos|decada de los|the)\s+'?(\d0)s?\b(?!\s*(?:bandas|grupos|bands|sellos|paises|discos|ciudades|mejores|primeros|mas))/.exec(
      q,
    ) ?? /\b(\d0|\d{3}0)'?s\b/.exec(q);
  if (m) {
    const from = century(m[1]!);
    return { from, to: from + 9 };
  }
  m = /(?:despues de|after|later than|posteriores? a)\s+(?:el\s+)?(\d{4})/.exec(q);
  if (m) return { from: Number(m[1]) + 1 };
  m = /(?:desde|a partir de|since|from)\s+(?:el\s+)?(\d{4})/.exec(q);
  if (m) return { from: Number(m[1]) };
  m = /(?:antes de|before|earlier than|anteriores? a)\s+(?:el\s+)?(\d{4})/.exec(q);
  if (m) return { to: Number(m[1]) - 1 };
  m = /(?:hasta|until|up to)\s+(?:el\s+)?(\d{4})/.exec(q);
  if (m) return { to: Number(m[1]) };
  m = /\b(19\d\d|20\d\d)\b/.exec(q);
  if (m) return { from: Number(m[1]), to: Number(m[1]) };
  return null;
}

/** Country names and nationality adjectives in the question, as Metal Archives names them. */
export function countriesIn(q: string, vocab: Vocabulary): string[] {
  const found: string[] = [];
  const tokens = words(q);
  for (let n = 3; n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const phrase = tokens.slice(i, i + n).join(" ");
      const country = phrase.length > 2 ? vocab.country(phrase) : null; // "us" is a pronoun more often
      if (country) found.push(country);
    }
  }
  for (const token of tokens) {
    for (const [stem, country] of DEMONYMS) if (token.startsWith(stem)) found.push(country);
    if (RUSSIAN.has(token)) found.push("Russia");
  }
  return [...new Set(found)];
}

/** The longest run of the original words (each capitalized, or a connector inside) that `accept` takes. */
function namedIn(question: string, accept: (folded: string) => boolean): string | null {
  const tokens = question.split(/[\s¿?¡!,;:"“”()]+/).filter(Boolean);
  let best: string | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const first = tokens[i]!;
    if (!/^[\p{Lu}\p{N}]/u.test(first) || NOT_A_NAME.has(fold(first))) continue;
    for (let j = i; j < tokens.length && j < i + 6; j++) {
      const token = tokens[j]!;
      if (j > i && !/^[\p{Lu}\p{N}]/u.test(token) && !CONNECTORS.has(token.toLowerCase())) break;
      const candidate = tokens.slice(i, j + 1).join(" ");
      if (accept(fold(candidate)) && (!best || candidate.length > best.length)) best = candidate;
    }
  }
  return best;
}

/** Text the question backs: it contains the value, or a word sharing its first `prefix` letters. */
function backed(q: string, value: string, prefix = 4): boolean {
  const v = fold(value);
  if (q.includes(v)) return true;
  const stem = v.slice(0, prefix);
  return stem.length === prefix && words(q).some((w) => w.startsWith(stem));
}

export function refine(question: string, model: Query, vocab: Vocabulary): Query {
  const q = fold(question).replace(/[¿?¡!]/g, " ");
  const tokens = words(q);

  for (const [pattern, missing] of UNSUPPORTED) if (pattern.test(q)) return { intent: "unsupported", missing };

  // a ranking needs a grouping the question names ("which country…"); otherwise it is a list
  const query: Query = { intent: model.intent === "top" ? "bands" : model.intent };
  // ---------- intent ----------
  const memberBands =
    /en (que|cuales) (bandas|grupos)|(which|what) bands|bandas (de|en) las que|ha tocado|has played/.test(q);
  const whose = /de quien es|whose|who (released|recorded|made)/.test(q);
  const lineup =
    !whose &&
    /quien(es)? (toca|tocan|canta|cantan|es el|es la|son|esta|estan)|who(?: is|'s| are|s)? (?:plays?|sings?|the)|\b(?:bajista|baterista|bateria|guitarrista|cantante|vocalista|teclista|bassist|drummer|guitarist|singer|vocalist|keyboardist) (?:de|of|in|en)\b|\bmiembros|\bintegrantes|formacion|members|line-?up/.test(
      q,
    );
  const albums =
    /\bdiscos?\b|\balbum|discografia\b|discography|\beps?\b|\bdemos?\b|\blps?\b|\brecords?\b(?! label)/.test(q);
  const count = /cuant[oa]s|how many|number of|numero de/.test(q);
  let group: Group | undefined;
  if (/\bmas\b|\bmost\b|predomin|mayor|more|top\b|ranking|clasificacion/.test(q)) {
    for (const [i, token] of tokens.entries()) {
      const hit = GROUP_WORDS.find(([pattern]) => pattern.test(token));
      const unitedStates = tokens[i + 1] === "unidos" || tokens[i - 1] === "united";
      if (hit && !unitedStates && !(hit[1] === "year" && /anos? \d/.test(q))) {
        group = hit[1];
        break;
      }
    }
  }
  if (memberBands) query.intent = "bands";
  else if (lineup) query.intent = "lineup";
  else if (albums) query.intent = "albums";
  else if (group) query.intent = "top";
  else if (count) query.intent = "count";
  // the model gave up but no cue says the data can't answer: try as a band search (undone at the end if no filter)
  if (query.intent === "unsupported") query.intent = "bands";
  if (query.intent === "top") query.groupBy = group ?? model.groupBy ?? "country";

  // ---------- names: band, member, album, label ----------
  const bandIsAsked = query.intent === "lineup" || query.intent === "albums";
  const titled = /(?:disco|album|álbum|llamado|titulado|called|titled)\s+["“']?([\p{Lu}\p{N}][^?"”']*)/u.exec(question);
  if (query.intent === "albums" && titled && !/\b(de|of|by)\s*$/.test(titled[1]!)) {
    const title = titled[1]!.trim();
    if (!vocab.isBand(fold(title)) || /llamado|titulado|called|titled|de quien|whose|who released/.test(q)) {
      query.album = title;
    }
  }
  if (bandIsAsked && !query.album) {
    const band = model.band && vocab.isBand(fold(model.band)) && backed(q, model.band, 99) ? model.band : null;
    query.band = band ?? namedIn(question, (name) => vocab.isBand(name)) ?? undefined;
  }
  if (model.album && !query.album && query.intent === "albums" && backed(q, model.album, 99)) query.album = model.album;
  if (memberBands || model.member) {
    const member = model.member && backed(q, model.member, 99) ? model.member : null;
    const named =
      /(?:est[aá]n?|toca|tocan|tocado|plays?|played|member of|miembro de)\s+([\p{Lu}][\p{L}'.-]+(?:\s+[\p{Lu}][\p{L}'.-]+)+)/u.exec(
        question,
      );
    const value = member ?? named?.[1];
    if (value) query.member = value;
  }
  if (!bandIsAsked && !query.member) {
    const labelAsked = /\bsellos?\b|\blabels?\b|discografica|\brecords\b/.test(q);
    // a capitalized run that is a label: only with two words or more, or if the question talks about labels
    const named = namedIn(question, (n) => vocab.isLabel(n) && (labelAsked || n.includes(" ")) && !vocab.country(n));
    const label = model.label && backed(q, model.label, 99) ? model.label : named;
    if (label) query.label = label;
  }

  // ---------- role ----------
  if (query.intent === "lineup" || query.member) {
    const role = ROLES.find(([pattern]) => pattern.test(q));
    if (role) query.role = role[1];
  }

  // ---------- themes ----------
  // the model's themes are kept when the question asks about themes (it translates them well); the question's
  // words are the fallback
  const article = "(?:(?:la|el|los|las|the|a)\\s+)?";
  const asked = new RegExp(
    `(?:hablen|hable|hablan|traten|trate|tratan|cantan|cantar|letras|tematica|tema)\\s+(?:de|sobre|acerca de)\\s+${article}([\\p{L}-]+)|\\b(?:about|sobre)\\s+${article}([\\p{L}-]+)|tematica\\s+([\\p{L}-]+)`,
    "u",
  ).exec(q);
  const aboutThemes =
    asked !== null || /\b(tematica|temas|letras|lyrics|themes?|hablen|hablan|traten|tratan|cantan)\b/.test(q);
  const themes = aboutThemes ? [...new Set((model.themes ?? []).map(themeWord))] : [];
  if (!themes.length && asked) themes.push(themeWord(asked[1] ?? asked[2] ?? asked[3]!));
  if (themes.length) query.themes = themes;

  // ---------- places ----------
  const named = [query.band, query.album, query.label, query.member].filter(Boolean).map((n) => fold(n!));
  const themeStems = [...(query.themes ?? []), ...(asked ? [asked[1] ?? asked[2] ?? asked[3]!] : [])].map((w) =>
    fold(w).slice(0, 4),
  );
  const isTheme = (value: string): boolean => themeStems.some((stem) => fold(value).startsWith(stem));
  const outside = (value: string): boolean => !named.some((name) => name.includes(fold(value))) && !isTheme(value);
  const countries = countriesIn(q, vocab).filter(outside);
  if (countries.length) query.country = countries[0]!;
  else if (model.country && !vocab.country(model.country) && backed(q, model.country, 3)) {
    query.location = model.country; // a region named as a country ("Scotland")
  }
  const place = Object.keys(PLACES).find((name) => new RegExp(`\\b${name}\\b`).test(q));
  if (model.location && outside(model.location) && !vocab.country(model.location)) {
    query.location = PLACES[fold(model.location)] ?? model.location;
  } else if (place && outside(place)) query.location = PLACES[place];
  if (!query.location && (query.intent === "bands" || query.intent === "count" || query.intent === "top")) {
    // "… de Murcia", "… from Tampa": a capitalized place after a preposition that is nothing else we know
    for (const m of question.matchAll(/\b(?:de|del|from|in|en)\s+([\p{Lu}][\p{L}'.-]+(?:\s+[\p{Lu}][\p{L}'.-]+)*)/gu)) {
      const candidate = m[1]!;
      const folded = fold(candidate);
      const genreWord = words(folded).some((w) => GENRE_WORDS.has(GENRE_SYNONYMS[w] ?? w));
      if (NOT_A_NAME.has(folded) || vocab.country(folded) || genreWord || !outside(candidate)) continue;
      if (countriesIn(folded, vocab).length) continue;
      query.location = PLACES[folded] ?? candidate;
      break;
    }
  }
  if (query.location && query.country && fold(query.location) === fold(query.country)) delete query.location;

  // ---------- genre ----------
  const genre: string[] = [];
  for (const token of tokens) {
    const word = GENRE_SYNONYMS[token] ?? token;
    if (!GENRE_WORDS.has(word) || !outside(token)) continue;
    if (!genre.includes(word)) genre.push(word);
  }
  if (genre.length) query.genre = genre;

  // ---------- status, years, sort, limit ----------
  if (query.intent !== "lineup" && query.intent !== "albums") {
    const status = STATUS_CUES.find(([pattern]) => pattern.test(q));
    if (status) query.status = status[1];
  }
  const years = yearsIn(q);
  if (years) {
    if (query.intent === "albums") {
      if (years.from) query.releasedFrom = years.from;
      if (years.to) query.releasedTo = years.to;
    } else {
      if (years.from) query.formedFrom = years.from;
      if (years.to) query.formedTo = years.to;
    }
  }
  if (query.intent === "albums") {
    const type = ALBUM_TYPES.find(([pattern]) => pattern.test(q));
    if (type) query.albumType = type[1];
    if (/\bprimer|\bfirst\b|debut/.test(q)) Object.assign(query, { sort: "oldest", limit: 1 });
    else if (/\bultim|\blatest\b|\blast\b|mas reciente|most recent|newest/.test(q)) {
      Object.assign(query, { sort: "newest", limit: 1 });
    }
    if (query.limit === 1 && !query.albumType) query.albumType = "Full-length";
  } else {
    const sort = SORTS.find(([pattern]) => pattern.test(q));
    if (sort) query.sort = sort[1];
  }
  const limit =
    /\b(?:top|primeros|primeras|first)\s+(\d{1,2})\b/.exec(q) ??
    /\b(\d{1,2})\s+(?:bandas|grupos|bands|sellos|labels|paises|countries|discos|albums|ciudades|cities)/.exec(q);
  if (limit) query.limit = Number(limit[1]);
  if (model.intent === "unsupported" && query.intent === "bands" && Object.keys(query).length === 1) {
    return { intent: "unsupported", missing: model.missing ?? "other" };
  }
  return query;
}
