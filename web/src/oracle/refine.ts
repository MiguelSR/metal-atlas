/**
 * Corrects the model's query with what the question itself says.
 *
 * The in-browser models are small: they translate names and paraphrases well but invent filters nobody asked for
 * (a country, a genre, a sort) and miss plain cues ("in the 80s", "how many", "the oldest"). So the question has the
 * last word: explicit cues (years, status, sort, counts, rankings, lineups, albums, what the data can't answer) are
 * read with rules, and what the model adds is kept only if the question backs it.
 */

import { fold } from "../format";
import type { AlbumType, Group, Missing, NameMatch, Query, Sort, Status } from "./query";
import { conceptsIn, isConcept, themeOf } from "./themes";
import { PLACE_NAMES } from "./vocab";

const PLACES: Record<string, string> = { ...PLACE_NAMES, "bay area": "Bay Area" };

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
    "which how of in and lineup ultimo primer mejores mejor"
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
  // the low ends first: "valoración más baja" must not be read as "best rated"
  [
    /\bpeor|\bworst\b|lowest[- ]rated|lowest (?:average )?(?:rating|score)|(?:valoracion|nota|puntuacion)(?: media)? mas baja|menor (?:valoracion|nota|puntuacion)|peor valorad|mas baja valoracion/,
    "lowestRating",
  ],
  [/menos rese|fewest reviews|least reviewed|less reviews|fewer reviews|menor numero de rese/, "fewestReviews"],
  [
    /mas antigu|oldest|earliest|veteran|pioner|pioneer|se form\w* (antes|primero)|formad[oa]s? (antes|primero)|\bprimer[oa]? (grupo|banda)|\bfirst band|formed first/,
    "oldest",
  ],
  [/mas (nuev|recient|joven)|newest|youngest|latest|\bultim|most recent|\blast\b/, "newest"],
  [
    /\bmejor|\bbest\b|top rated|highest[- ]rated|highest (?:average )?(?:rating|score)|valorad|puntuad|(?:valoracion|nota|puntuacion)(?: media)? mas alta/,
    "rating",
  ],
  [/mas rese|most review|mas popular|most popular|mas conocid|best known|famos|famous/, "reviews"],
];

const STATUS_CUES: [RegExp, Status][] = [
  [/cambi\w* (?:de|el|su) nombre|changed (?:their |its )?names?|renamed/, "Changed name"],
  [/en disputa|disputed/, "Disputed"],
  [/estado desconocido|unknown status|status unknown/, "Unknown"],
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

const REVIEW = "(?:resenas?|reviews?|criticas?)";

/** Review-count ranges: "entre 5 y 10 reseñas", "more than 20 reviews", "sin reseñas". */
export function reviewsIn(q: string): { min?: number; max?: number } | null {
  const text = q.replace(/\b(?:una|one|a single)\s+(resena|review)/g, "1 $1");
  const n = (pattern: string): RegExpExecArray | null => new RegExp(pattern).exec(text);
  let m: RegExpExecArray | null;
  if (n(`\\b(?:sin|no tienen?|no tengan|without|no|ninguna|zero|0)\\s+${REVIEW}`)) return { max: 0 };
  if ((m = n(`(?:entre|between|de)\\s+(\\d+)\\s+(?:y|and|a|to)\\s+(\\d+)\\s+${REVIEW}`))) {
    return { min: Number(m[1]), max: Number(m[2]) };
  }
  if ((m = n(`(?:mas de|more than|over)\\s+(\\d+)\\s+${REVIEW}`))) return { min: Number(m[1]) + 1 };
  if ((m = n(`(?:al menos|como minimo|minimo|at least)\\s+(\\d+)\\s+${REVIEW}`))) return { min: Number(m[1]) };
  if ((m = n(`(?:menos de|fewer than|less than|under)\\s+(\\d+)\\s+${REVIEW}`))) return { max: Number(m[1]) - 1 };
  if ((m = n(`(?:como mucho|como maximo|at most|hasta|up to)\\s+(\\d+)\\s+${REVIEW}`))) return { max: Number(m[1]) };
  if ((m = n(`(?:con|with|tengan|tienen|have|has)\\s+(?:exactamente\\s+|exactly\\s+)?(\\d+)\\s+${REVIEW}`))) {
    return { min: Number(m[1]), max: Number(m[1]) };
  }
  return null;
}

/** Average-rating ranges: "valoración media superior al 90%", "rated below 50%", "entre el 60 y el 70%". */
export function ratingIn(q: string): { min?: number; max?: number } | null {
  if (!/valorac|nota|puntuac|rating|rated|score|%/.test(q)) return null;
  let m = /entre (?:el )?(\d{1,3})\s*%?\s*y (?:el )?(\d{1,3})\s*%|between (\d{1,3})\s*%?\s*and (\d{1,3})\s*%/.exec(q);
  if (m) return { min: Number(m[1] ?? m[3]), max: Number(m[2] ?? m[4]) };
  m =
    /(?:superior|mayor|mas|por encima|encima|above|over|higher than|more than|at least|al menos|minimo)\s+(?:a |al |de |del |que |the |of )?(?:un |una |el )?(\d{1,3})\s*%?/.exec(
      q,
    );
  if (m) return { min: Number(m[1]) };
  m =
    /(?:inferior|menor|menos|por debajo|debajo|below|under|lower than|less than)\s+(?:a |al |de |del |que |the |of )?(?:un |una |el )?(\d{1,3})\s*%?/.exec(
      q,
    );
  if (m) return { max: Number(m[1]) };
  return null;
}

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
  // possessives belong to the name before them: "Cannibal Corpse's first album"
  const tokens = question
    .split(/[\s¿?¡!,;:"“”()]+/)
    .filter(Boolean)
    .map((token) => token.replace(/['’]s?$/, ""));
  let best: string | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const first = tokens[i]!;
    if (!/^[\p{Lu}\p{N}]/u.test(first) || NOT_A_NAME.has(fold(first))) continue;
    for (let j = i; j < tokens.length && j < i + 6; j++) {
      const token = tokens[j]!;
      // lowercase words may sit inside a name ("Darker than Black Records"); the data decides
      if (j > i && !/^[\p{Lu}\p{N}]/u.test(token) && !CONNECTORS.has(token.toLowerCase()) && j === i + 5) break;
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

const UNSIGNED =
  /\bsin (?:sello|discografica)|\bno tengan? (?:sello|discografica)|\bunsigned\b|\bindependientes?\b|\bwithout (?:a )?(?:record )?label|\bno (?:record )?label|self-released|autoeditad/;

/** A band name in quotes, a capitalized run (stopping at prepositions) or one word. */
const NAME = String.raw`(?:["“'«]([^"”'»]+)["”'»]|([\p{Lu}\p{N}][^\s?¿!,]*(?:\s+(?:(?:and|of|the|&|n')\s+)?(?!(?:en|de|del|from|in|que|y|and|con|with|formad\w*|activ\w*)\b)[\p{Lu}\p{N}][^\s?¿!,]*)*)|([\p{L}\p{N}][^\s?¿!,]*))`;
const NAME_PATTERNS: [RegExp, NameMatch][] = [
  [
    new RegExp(
      String.raw`(?:nombres?|names?)\s+(?:que\s+)?(?:empiecen?|empiezan?|comiencen?|comienzan?|starts?|starting|begins?|beginning)\s+(?:por|con|with|by)\s+` +
        NAME,
      "iu",
    ),
    "prefix",
  ],
  [
    new RegExp(
      String.raw`(?:nombres?|names?)\s+(?:que\s+)?(?:contengan?|contienen?|incluyan?|incluyen?|lleven?|llevan?|contains?|containing|includes?|including)\s+(?:la palabra\s+|the word\s+)?` +
        NAME,
      "iu",
    ),
    "contains",
  ],
  [
    new RegExp(
      String.raw`(?:nombres?|names?)\s+(?:que\s+)?(?:terminen?|terminan?|acaben?|acaban?|ends?|ending)\s+(?:en|por|con|with|in)\s+` +
        NAME,
      "iu",
    ),
    "suffix",
  ],
  [new RegExp(String.raw`(?:empiecen?|comiencen?|start|begin)\s+(?:por|con|with)\s+` + NAME, "iu"), "prefix"],
  [
    new RegExp(
      String.raw`(?:se\s+llam(?:e|en|a|an)|llamad[oa]s?|named|called)\s+(?:exactamente\s+|exactly\s+|igual que\s+)?` +
        NAME,
      "iu",
    ),
    "exact",
  ],
];

/** A band name the question searches for ("que se llame Slayer", "names starting with Killer"), and how. */
export function nameIn(question: string): { name: string; match: NameMatch } | null {
  for (const [pattern, match] of NAME_PATTERNS) {
    const m = pattern.exec(question);
    const name = m && (m[1] ?? m[2] ?? m[3]);
    if (name) return { name: name.trim(), match };
  }
  return null;
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
  const albums = /\bdiscos?\b|\balbum|discografia\b|discography|\beps?\b|\bdemos?\b|\blps?\b/.test(q);
  const count = /cuant[oa]s|how many|number of|numero de/.test(q);
  let group: Group | undefined;
  // "more" in lowercase only: "More Hate Productions" is a label, not a ranking
  if (/\bmas\b|\bmost\b|predomin|mayor|top\b|ranking|clasificacion/.test(q) || /\bmore\b/.test(question)) {
    for (const [i, token] of tokens.entries()) {
      const hit = GROUP_WORDS.find(([pattern]) => pattern.test(token));
      // part of a country's name, not a grouping: "Estados Unidos", "Países Bajos", "United States"
      const unitedStates =
        ["unidos", "bajos", "arabes"].includes(tokens[i + 1] ?? "") ||
        tokens[i - 1] === "united" ||
        // "sin sello", "without a label": a filter, not a grouping
        ["sin", "without", "no", "tenga", "tengan", "a"].includes(tokens[i - 1] ?? "");
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
  // a count only when the question asks for one ("how many"); the model sometimes counts a plain list
  if (query.intent === "count" && !count) query.intent = "bands";
  // the model gave up but no cue says the data can't answer: try as a band search (undone at the end if no filter)
  if (query.intent === "unsupported") query.intent = "bands";
  if (query.intent === "top") query.groupBy = group ?? model.groupBy ?? "country";

  // ---------- band names: "que se llame Slayer", "cuyo nombre empiece por Killer" ----------
  const byName = query.intent === "albums" || query.intent === "lineup" ? null : nameIn(question);
  if (byName) {
    if (query.intent !== "count" && query.intent !== "top") query.intent = "bands";
    query.name = byName.name;
    query.nameMatch = byName.match;
  }
  const unsigned = UNSIGNED.test(q);
  if (unsigned) query.unsigned = true;

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
  if (!bandIsAsked && !query.member && !unsigned) {
    const labelAsked = /\bsellos?\b|\blabels?\b|discografica|\brecords\b/.test(q);
    // a capitalized run that is a label: only with two words or more, or if the question talks about labels
    const mentioned = countriesIn(q, vocab).map(fold);
    const named = namedIn(
      question,
      (n) =>
        vocab.isLabel(n) &&
        (labelAsked || n.includes(" ")) &&
        !vocab.country(n) &&
        !mentioned.some((c) => c.includes(n)) &&
        !words(n).every((w) => GENRE_WORDS.has(w) || w === "metal" || w === "rock") &&
        !(query.name && fold(query.name).includes(n)),
    );
    const label = model.label && backed(q, model.label, 99) ? model.label : named;
    if (label) query.label = label;
  }

  // ---------- role ----------
  if (query.intent === "lineup" || query.member) {
    const role = ROLES.find(([pattern]) => pattern.test(q));
    if (role) query.role = role[1];
  }

  // ---------- themes ----------
  // the themes are the concepts (vocab.ts) named after a cue ("que hablen de…", "about…"); the model's only if none
  const cue =
    /\b(?:tematicas?|temas?|letras|lyrics|themes?|about|sobre|acerca de|(?:habl|trat|cant)(?:a|an|en|e|o|ar|aron|aba|aban|ado|ando)|sings?|sang|writes?|wrote)\b/.exec(
      q,
    );
  // not in lineup or album questions ("¿Quién canta en Severe Torture?"), and never inside a name
  const themed = cue !== null && query.intent !== "lineup" && query.intent !== "albums";
  let themeText = themed ? q.slice(cue.index) : "";
  for (const name of [query.band, query.album, query.label, query.member]) {
    if (name) themeText = themeText.replace(fold(name), " ");
  }
  let themes = conceptsIn(themeText);
  if (!themes.length && themed && model.themes) {
    const mapped = [...new Set(model.themes.map(themeOf))];
    // the model lists synonyms: keep the ones the vocabulary knows when there are any
    themes = mapped.some(isConcept) ? mapped.filter(isConcept) : mapped;
  }
  if (!themes.length && themed) {
    const word = /^\S+\s+(?:(?:de|del|sobre|about|of)\s+)?(?:(?:la|el|los|las|the|a)\s+)?([\p{L}-]{3,})/u.exec(
      themeText,
    );
    if (word) themes = [themeOf(word[1]!)];
  }
  if (themes.length) query.themes = themes;
  const isTheme = (value: string): boolean => themed && themeText.includes(fold(value));

  // ---------- places ----------
  const named = [query.band, query.album, query.label, query.member, query.name].filter(Boolean).map((n) => fold(n!));
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
  // genre words before the theme cue only: "pagan metal bands that sing about paganism"
  // and not inside a name ("death técnico cuyo nombre contenga Death": the first "death" is the genre)
  let genreText = themed ? q.slice(0, cue.index) : q;
  for (const name of named) {
    const at = genreText.lastIndexOf(name);
    if (at >= 0) genreText = genreText.slice(0, at) + " " + genreText.slice(at + name.length);
  }
  for (const token of words(genreText)) {
    const word = GENRE_SYNONYMS[token] ?? token;
    if (!GENRE_WORDS.has(word)) continue;
    if (!genre.includes(word)) genre.push(word);
  }
  if (genre.length) {
    query.genre = genre;
    // "pure doom", "doom sin mezclar", "only doom": every genre of the band is that one
    const only = new RegExp(`\\b(?:solo|solamente|only|just)\\s+(?:de\\s+)?(?:${genre.join("|")})`);
    if (
      /\bpur[oa]s?\b|\bpurist|sin mezcla|sin mezclar|sin otros generos|unicamente|exclusivamente|\bpurely\b|\bpure\b|unmixed|strictly|nothing but|no other genres?/.test(
        q,
      ) ||
      only.test(q)
    ) {
      query.pureGenre = true;
    }
  }

  // ---------- status, years, sort, limit ----------
  if (query.intent !== "lineup" && query.intent !== "albums") {
    const status = STATUS_CUES.find(([pattern]) => pattern.test(q));
    if (status) query.status = status[1];
  }
  // review counts and ratings ("entre 5 y 10 reseñas", "superior al 90%"); their numbers are not years
  const reviewRange = reviewsIn(q);
  if (reviewRange?.min !== undefined) query.reviewsMin = reviewRange.min;
  if (reviewRange?.max !== undefined) query.reviewsMax = reviewRange.max;
  const reviewless = q.replace(new RegExp(`[^\\s]*\\s*\\d+\\s+${REVIEW}`, "g"), " ");
  const ratingRange = reviewRange ? null : ratingIn(reviewless);
  if (ratingRange?.min !== undefined) query.ratingMin = ratingRange.min;
  if (ratingRange?.max !== undefined) query.ratingMax = ratingRange.max;
  const years = yearsIn(ratingRange ? reviewless.replace(/\d{1,3}\s*%/g, " ") : reviewless);
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
