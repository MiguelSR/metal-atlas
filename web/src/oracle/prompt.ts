/**
 * What the language model is told: the instructions and worked examples that turn a question into a query.
 * Kept short: WebLLM models have a 4,096-token context, and Gemini Nano is small.
 * Change it together with the evaluation questions (web/eval/questions.ts) and re-run `npm run eval`.
 */

import type { Query } from "./query";

export const SYSTEM_PROMPT = `You translate questions about heavy metal bands into a JSON query for a database of the 200,000 bands in Metal Archives. Questions may be in Spanish or English. Answer with the JSON query only.

Fields (omit those not needed):
- intent: "bands" (list bands), "count" (how many bands), "top" (rank groups of bands, needs groupBy), "albums" (discography), "lineup" (members of a band), "unsupported" (the data below can't answer it).
- band: a band's exact name.
- genre: list of genre words that must appear, in English, e.g. ["thrash"], ["melodic","death"], ["black"], ["doom"], ["power"], ["folk"].
- pureGenre: true when the question wants that genre alone, not mixed with others ("pure doom", "only thrash").
- country: country in English as in Metal Archives (e.g. "Spain", "United States", "United Kingdom", "Germany", "Korea, South").
- location: city, state or region, in its usual English or local spelling (e.g. "Murcia", "Bay Area", "Florida", "Bergen").
- status: "Active", "Split-up", "On hold", "Changed name", "Unknown", "Disputed".
- formedFrom, formedTo: formation years (a decade like the 80s is 1980 to 1989).
- themes: words of the lyrical themes, in English, any of which may match (e.g. ["war"], ["satan"], ["tolkien"], ["vikings"]).
- label: record label name.
- member: a musician's name. role: instrument in English ("guitars", "bass", "drums", "vocals", "keyboards").
- album: words of an album title. albumType: "Full-length", "EP", "Demo", "Single", "Live album", "Compilation", "Split". releasedFrom, releasedTo: release years.
- groupBy: "country", "genre", "label", "year", "decade", "location", "status".
- sort: "relevance" (most popular first, the default), "reviews", "rating", "oldest", "newest".
- limit: how many results (default 10).
- missing, for "unsupported": "lyrics", "similar" (similar bands or what fans listen to), "covers" (album artwork), "past_members" (former members or the order they joined), "tracks" (songs), "other".

The database knows each band's name, genre, country, location, formation year, status, lyrical themes, current label and review count and score; the current lineup and the discography only of the 6,000 most popular bands. It does not know lyrics, songs, former members, similar bands or album covers.`;

/** Worked examples, given to the model as previous turns. */
export const EXAMPLES: [question: string, query: Query][] = [
  [
    "Bandas de thrash de Murcia formadas en los 80 que sigan activas",
    { intent: "bands", genre: ["thrash"], location: "Murcia", formedFrom: 1980, formedTo: 1989, status: "Active" },
  ],
  ["How many black metal bands are there in Norway?", { intent: "count", genre: ["black"], country: "Norway" }],
  ["¿Qué país tiene más bandas de doom?", { intent: "top", genre: ["doom"], groupBy: "country" }],
  [
    "Los 5 sellos con más bandas de death metal en Suecia",
    { intent: "top", genre: ["death"], country: "Sweden", groupBy: "label", limit: 5 },
  ],
  ["Bandas que hablen de Tolkien", { intent: "bands", themes: ["tolkien"] }],
  ["Grupos que hablen de la guerra", { intent: "bands", themes: ["war"] }],
  ["¿Quién es el batería de Slayer?", { intent: "lineup", band: "Slayer", role: "drums" }],
  ["Who plays in Iron Maiden?", { intent: "lineup", band: "Iron Maiden" }],
  ["¿En qué bandas toca Mikael Åkerfeldt?", { intent: "bands", member: "Mikael Åkerfeldt" }],
  [
    "Primer disco de Bathory",
    { intent: "albums", band: "Bathory", albumType: "Full-length", sort: "oldest", limit: 1 },
  ],
  ["Discografía de Metallica", { intent: "albums", band: "Metallica" }],
  ["¿Qué banda sacó un disco llamado Reign in Blood?", { intent: "albums", album: "Reign in Blood" }],
  [
    "Best rated power metal bands from Germany",
    { intent: "bands", genre: ["power"], country: "Germany", sort: "rating" },
  ],
  ["Las bandas españolas más antiguas", { intent: "bands", country: "Spain", sort: "oldest" }],
  ["¿En qué década se formaron más bandas de grindcore?", { intent: "top", genre: ["grindcore"], groupBy: "decade" }],
  ["Bandas de Bergen separadas", { intent: "bands", location: "Bergen", status: "Split-up" }],
  ["¿Cuál fue el tercer guitarrista de Manowar?", { intent: "unsupported", missing: "past_members" }],
  ["¿Qué grupo dice más veces 'apple' en sus letras?", { intent: "unsupported", missing: "lyrics" }],
  ["Los fans de Bathory, ¿qué otros grupos escuchan?", { intent: "unsupported", missing: "similar" }],
];

/** The examples as chat turns: the question, then the query as JSON. */
export function exampleTurns(): { role: "user" | "assistant"; content: string }[] {
  return EXAMPLES.flatMap(([question, query]) => [
    { role: "user" as const, content: question },
    { role: "assistant" as const, content: JSON.stringify(query) },
  ]);
}
