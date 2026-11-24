/**
 * Evaluation questions for the Oracle's model: a question and the fields its query must have (others are ignored).
 * Different from the prompt's examples on purpose, so the score says how well the model generalizes.
 */

import type { Query } from "../src/oracle/query";

export const QUESTIONS: [question: string, expected: Partial<Query>][] = [
  // lists and filters
  ["Bandas de death metal de Madrid", { intent: "bands", genre: ["death"], location: "Madrid" }],
  [
    "Grupos de heavy metal de Sevilla formados en los 90",
    { intent: "bands", genre: ["heavy"], location: "Seville", formedFrom: 1990, formedTo: 1999 },
  ],
  [
    "Active thrash bands from the Bay Area",
    { intent: "bands", genre: ["thrash"], location: "Bay Area", status: "Active" },
  ],
  [
    "Bandas de black metal finlandesas que ya no existen",
    { intent: "bands", genre: ["black"], country: "Finland", status: "Split-up" },
  ],
  ["Bandas de folk metal que hablen de vikingos", { intent: "bands", genre: ["folk"], themes: ["viking"] }],
  ["Bandas cuyas letras traten sobre Lovecraft", { intent: "bands", themes: ["lovecraft"] }],
  ["Bandas de Nuclear Blast de Alemania", { intent: "bands", label: "Nuclear Blast", country: "Germany" }],
  ["Las bandas de doom con más reseñas", { intent: "bands", genre: ["doom"], sort: "reviews" }],
  [
    "Mejores bandas de speed metal de Japón según las reseñas",
    { intent: "bands", genre: ["speed"], country: "Japan", sort: "rating" },
  ],
  ["Bandas de metal de Islandia formadas después de 2010", { intent: "bands", country: "Iceland", formedFrom: 2011 }],
  ["Las 20 bandas más antiguas de Brasil", { intent: "bands", country: "Brazil", sort: "oldest", limit: 20 }],
  [
    "Bandas de melodic death metal de Gotemburgo",
    { intent: "bands", genre: ["melodic", "death"], location: "Gothenburg" },
  ],
  // counts
  ["¿Cuántas bandas de metal hay en España?", { intent: "count", country: "Spain" }],
  [
    "How many active doom metal bands are there in the United Kingdom?",
    { intent: "count", genre: ["doom"], country: "United Kingdom", status: "Active" },
  ],
  [
    "¿Cuántas bandas de power metal se formaron en 1999?",
    { intent: "count", genre: ["power"], formedFrom: 1999, formedTo: 1999 },
  ],
  // rankings
  ["¿Qué país tiene más bandas de black metal?", { intent: "top", genre: ["black"], groupBy: "country" }],
  [
    "¿Qué ciudades de Estados Unidos tienen más bandas de death metal?",
    { intent: "top", genre: ["death"], country: "United States", groupBy: "location" },
  ],
  ["Los sellos con más bandas de thrash", { intent: "top", genre: ["thrash"], groupBy: "label" }],
  ["¿Qué géneros predominan en México?", { intent: "top", country: "Mexico", groupBy: "genre" }],
  ["¿En qué año se formaron más bandas en Grecia?", { intent: "top", country: "Greece", groupBy: "year" }],
  // lineups and members
  ["¿Quién canta en Judas Priest?", { intent: "lineup", band: "Judas Priest", role: "vocals" }],
  ["Miembros de Blind Guardian", { intent: "lineup", band: "Blind Guardian" }],
  ["¿Quién toca el bajo en Megadeth?", { intent: "lineup", band: "Megadeth", role: "bass" }],
  ["¿En qué grupos está Dave Lombardo?", { intent: "bands", member: "Dave Lombardo" }],
  // albums
  ["Discos de Iron Maiden de los 80", { intent: "albums", band: "Iron Maiden", releasedFrom: 1980, releasedTo: 1989 }],
  ["Último disco de Opeth", { intent: "albums", band: "Opeth", sort: "newest", limit: 1 }],
  ["EPs de Ghost", { intent: "albums", band: "Ghost", albumType: "EP" }],
  ["¿De quién es el disco Master of Puppets?", { intent: "albums", album: "Master of Puppets" }],
  // out of reach
  ["¿Cuál fue el primer batería de Metallica?", { intent: "unsupported", missing: "past_members" }],
  ["Bandas parecidas a Emperor", { intent: "unsupported", missing: "similar" }],
  ["¿Qué disco tiene una calavera con alas en la portada?", { intent: "unsupported", missing: "covers" }],
  ["¿Qué canción de Slayer es la más larga?", { intent: "unsupported", missing: "tracks" }],
  // formerly held out (tuned on 2026-11-24)
  ["Grupos de sludge de Nueva Orleans", { intent: "bands", genre: ["sludge"], location: "New Orleans" }],
  ["¿Cuántas bandas de grindcore hay en Japón?", { intent: "count", genre: ["grindcore"], country: "Japan" }],
  [
    "Bandas de black metal polacas con temática satánica",
    { intent: "bands", genre: ["black"], country: "Poland", themes: ["satan"] },
  ],
  [
    "Show me progressive metal bands from Australia formed in the 2000s",
    { intent: "bands", genre: ["progressive"], country: "Australia", formedFrom: 2000, formedTo: 2009 },
  ],
  [
    "¿Qué sello tiene más bandas de power metal en Italia?",
    { intent: "top", genre: ["power"], country: "Italy", groupBy: "label" },
  ],
  ["¿Quién es el guitarrista de Pantera?", { intent: "lineup", band: "Pantera", role: "guitars" }],
  ["Formación actual de Sepultura", { intent: "lineup", band: "Sepultura" }],
  ["Demos de Darkthrone", { intent: "albums", band: "Darkthrone", albumType: "Demo" }],
  ["Primer álbum de Death", { intent: "albums", band: "Death", sort: "oldest", limit: 1 }],
  ["Bandas de thrash chilenas activas", { intent: "bands", genre: ["thrash"], country: "Chile", status: "Active" }],
  [
    "Las bandas de gothic metal más populares de Holanda",
    { intent: "bands", genre: ["gothic"], country: "Netherlands", sort: "reviews" },
  ],
  ["Which decade had the most thrash metal bands formed?", { intent: "top", genre: ["thrash"], groupBy: "decade" }],
  ["Bandas que cantan sobre la guerra", { intent: "bands", themes: ["war"] }],
  ["Bandas en las que ha tocado Gene Hoglan", { intent: "bands", member: "Gene Hoglan" }],
  ["Discos de Bathory publicados antes de 1990", { intent: "albums", band: "Bathory", releasedTo: 1989 }],
  [
    "¿Cuántas bandas de stoner hay en Estados Unidos que sigan activas?",
    { intent: "count", genre: ["stoner"], country: "United States", status: "Active" },
  ],
  ["Bandas de doom de Birmingham", { intent: "bands", genre: ["doom"], location: "Birmingham" }],
  ["¿Qué canciones tiene el Paranoid de Black Sabbath?", { intent: "unsupported", missing: "tracks" }],
  ["¿Qué bandas suenan como Opeth?", { intent: "unsupported", missing: "similar" }],
  ["Las 5 bandas mejor valoradas de Grecia", { intent: "bands", country: "Greece", sort: "rating", limit: 5 }],
  // held out until 2026-11-24 (first score: 17/20 with Gemini Nano + rules, model alone 9/20, rules alone 17/20)
  ["dame grupos de death técnico de Canadá", { intent: "bands", genre: ["technical", "death"], country: "Canada" }],
  ["Que bandas de heavy hay en Bilbao", { intent: "bands", genre: ["heavy"], location: "Bilbao" }],
  [
    "número de bandas de black metal en Ucrania formadas desde 2014",
    { intent: "count", genre: ["black"], country: "Ukraine", formedFrom: 2014 },
  ],
  ["What are the most reviewed Finnish bands?", { intent: "bands", country: "Finland", sort: "reviews" }],
  ["¿Qué país tiene más bandas de folk metal?", { intent: "top", genre: ["folk"], groupBy: "country" }],
  ["ranking de ciudades españolas con más bandas", { intent: "top", country: "Spain", groupBy: "location" }],
  ["¿Quién es el cantante de Iron Maiden?", { intent: "lineup", band: "Iron Maiden", role: "vocals" }],
  ["who's the bassist of Metallica", { intent: "lineup", band: "Metallica", role: "bass" }],
  ["dime los miembros de Gojira", { intent: "lineup", band: "Gojira" }],
  ["¿Qué discos sacó Celtic Frost?", { intent: "albums", band: "Celtic Frost" }],
  ["el último álbum de Mayhem", { intent: "albums", band: "Mayhem", sort: "newest", limit: 1 }],
  ["discos en directo de Iron Maiden", { intent: "albums", band: "Iron Maiden", albumType: "Live album" }],
  [
    "Bandas de doom británicas separadas",
    { intent: "bands", genre: ["doom"], country: "United Kingdom", status: "Split-up" },
  ],
  [
    "bandas de Century Media formadas en los 90",
    { intent: "bands", label: "Century Media", formedFrom: 1990, formedTo: 1999 },
  ],
  ["bandas que traten sobre el espacio exterior", { intent: "bands", themes: ["space"] }],
  ["bandas de pagan metal sobre mitología eslava", { intent: "bands", genre: ["pagan"], themes: ["myth", "slav"] }],
  ["¿Cuántas bandas tiene registradas Metal Archives en Islandia?", { intent: "count", country: "Iceland" }],
  [
    "bandas más nuevas de grindcore de Chequia",
    { intent: "bands", genre: ["grindcore"], country: "Czechia", sort: "newest" },
  ],
  ["¿Quién fue el primer cantante de Iron Maiden?", { intent: "unsupported", missing: "past_members" }],
  ["recomiéndame algo parecido a Dissection", { intent: "unsupported", missing: "similar" }],
  // themes in plain words, written after the concept vocabulary (2026-11-24), first score 21/22 (22/22 after fixing one expectation), Gemini Nano + rules
  [
    "¿Cuál fue el grupo que usó la temática de cristianismo que se formó antes?",
    { intent: "bands", themes: ["christian"], sort: "oldest" },
  ],
  [
    "¿Cuál fue el grupo que habló de cristianismo que se formó antes?",
    { intent: "bands", themes: ["christian"], sort: "oldest" },
  ],
  [
    "¿Cuál fue el primer grupo de doom metal que habló de cristianismo?",
    { intent: "bands", genre: ["doom"], themes: ["christian"], sort: "oldest" },
  ],
  ["bandas que hablen de vampiros", { intent: "bands", themes: ["vamp"] }],
  ["grupos que cantan sobre astronomía", { intent: "bands", themes: ["space"] }],
  ["bandas de black metal sobre brujas", { intent: "bands", genre: ["black"], themes: ["witch"] }],
  ["bandas que hablan de la Segunda Guerra Mundial", { intent: "bands", themes: ["world war ii"] }],
  ["grupos de death metal sobre dinosaurios", { intent: "bands", genre: ["death"], themes: ["prehistor"] }],
  ["bandas que hablen del mar", { intent: "bands", themes: ["sea"] }],
  ["bandas de folk sobre lobos", { intent: "bands", genre: ["folk"], themes: ["wolf"] }],
  ["bandas de heavy que hablen de la Edad Media", { intent: "bands", genre: ["heavy"], themes: ["medieval"] }],
  ["¿Cuántas bandas hablan de extraterrestres?", { intent: "count", themes: ["alien"] }],
  ["bandas de thrash que cantan sobre el alcohol", { intent: "bands", genre: ["thrash"], themes: ["alcohol"] }],
  ["bandas de doom que hablen de la soledad", { intent: "bands", genre: ["doom"], themes: ["lonel"] }],
  ["bandas que traten la mitología griega", { intent: "bands", themes: ["myth", "greek"] }],
  ["grupos de grindcore sobre asesinos en serie", { intent: "bands", genre: ["grindcore"], themes: ["serial kill"] }],
  ["bandas suecas que hablen de ocultismo", { intent: "bands", country: "Sweden", themes: ["occult"] }],
  ["bandas que hablen del antiguo Egipto", { intent: "bands", themes: ["egypt"] }],
  ["bands that sing about the devil", { intent: "bands", themes: ["satan"] }],
  ["bandas de power metal que hablen de dragones", { intent: "bands", genre: ["power"], themes: ["dragon"] }],
  ["bandas que cantan sobre la reencarnación", { intent: "bands", themes: ["reincarnation"] }],
  ["bandas japonesas que hablen de samuráis", { intent: "bands", country: "Japan", themes: ["japan"] }],
  // owner's reports, 2026-11-24 (unsigned bands, band names, pure genres)
  ["¿Banda sin sello (o que no tenga sello) con más reseñas?", { intent: "bands", unsigned: true, sort: "reviews" }],
  ["¿Hay algún grupo que se llame Slayer?", { intent: "bands", name: "Slayer", nameMatch: "exact" }],
  ["¿Cuántas bandas hay que se llamen exactamente Killer?", { intent: "count", name: "Killer", nameMatch: "exact" }],
  ["¿Cuántas bandas hay cuyo nombre empiece por Killer?", { intent: "count", name: "Killer", nameMatch: "prefix" }],
  [
    "bandas de black metal cuyo nombre termine en Hate",
    { intent: "bands", genre: ["black"], name: "Hate", nameMatch: "suffix" },
  ],
  ["Is there a band called Flotsam and Jetsam?", { intent: "bands", name: "Flotsam and Jetsam", nameMatch: "exact" }],
  [
    "bandas de thrash españolas que cambiaron de nombre",
    { intent: "bands", genre: ["thrash"], country: "Spain", status: "Changed name" },
  ],
  [
    "primer grupo de doom metal sin mezclar con otros géneros",
    { intent: "bands", genre: ["doom"], pureGenre: true, sort: "oldest" },
  ],
  ["primer grupo de puro doom", { intent: "bands", genre: ["doom"], pureGenre: true, sort: "oldest" }],
  // owner's reports, 2026-11-24 (review counts, ratings, low-end sorts)
  [
    "Bandas de heavy metal de Reino Unido que tengan entre 5 y 10 reseñas?",
    { intent: "bands", genre: ["heavy"], country: "United Kingdom", reviewsMin: 5, reviewsMax: 10 },
  ],
  [
    "Bandas de heavy metal de reino unido con valoración media más baja?",
    { intent: "bands", genre: ["heavy"], country: "United Kingdom", sort: "lowestRating" },
  ],
  ["Banda de doom metal con menos reseñas?", { intent: "bands", genre: ["doom"], sort: "fewestReviews" }],
  [
    "bandas de black metal noruegas sin reseñas",
    { intent: "bands", genre: ["black"], country: "Norway", reviewsMax: 0 },
  ],
  ["thrash bands rated above 90%", { intent: "bands", genre: ["thrash"], ratingMin: 90 }],
  [
    "worst rated power metal bands from Italy",
    { intent: "bands", genre: ["power"], country: "Italy", sort: "lowestRating" },
  ],
];
