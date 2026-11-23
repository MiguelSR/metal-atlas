/** Interface texts in English and Spanish. The viewer's saved choice wins; otherwise the browser's language. */

export const LANGS = ["en", "es"] as const;
export type Lang = (typeof LANGS)[number];
const STORAGE_KEY = "ma-lang";

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

function english(nf: (n: number) => string) {
  return {
    loading: "Loading…",
    searchPh: "Search bands… e.g. machete",
    searchAl: "Search bands by name",
    formed: "Formed",
    from: "from",
    to: "to",
    formedFromAl: "Formed from year",
    formedToAl: "Formed up to year",
    yearsAl: "Formation year",
    clearYears: "Clear years",
    presetsAl: "Quick ranges",
    countryPh: "Find country…",
    countryAl: "Find country",
    mapAl: "World map colored by the metal genre with the most bands in each country",
    loadingBands: "Loading 202,692 bands…",
    credData: "Data",
    credGeo: "Geography",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    resetView: "Reset view",
    playerAl: "Preview player",
    modeTitle: "Switch between the map and the guessing game",
    modeGame: "Game",
    modeMap: "← Map",
    langTitle: "Idioma: ver en español",
    intl: "International (no single country)",
    status: ["", "Active", "On hold", "Split-up", "Unknown status", "Changed name", "Disputed"],
    plNone: "No preview found",
    plPause: "Pause",
    plPlay: "Play a 30 s preview",
    npClose: "Close player",
    npNext: "Next track",
    npStop: "Stop and close",
    npPlay: "Play",
    npPause: "Pause",
    npBlocked: "Playback was blocked by the browser",
    npUnavail: "Previews unavailable here (network blocked)",
    npVia: "preview via Apple Music",
    maSearch: "See these bands on Metal Archives (same filters)",
    otherGenre: "Other genre",
    yrRange: (a: number, b: number) => `formed ${a}–${b}`,
    yrFrom: (a: number) => `formed ${a} or later`,
    yrTo: (b: number) => `formed ${b} or earlier`,
    nameContains: (q: string) => `name contains “${q}”`,
    matching: (q: string) => `matching “${q}”`,
    allEras: "all eras",
    bands: (n: number) => `${nf(n)} ${plural(n, "band", "bands")}`,
    subRegion: "region view · zoom out to go back to countries",
    subHint: "click a country, or zoom in to see regions",
    legendT: "Leading genre · by band count",
    legendBands: (n: number) => `${nf(n)} bands · `,
    countries: (n: number) => `${n} ${plural(n, "country", "countries")}`,
    legendNone: "No bands in this selection",
    tipNone: "no bands",
    tipNoneSel: "no bands in this selection",
    filterNote: " With a year filter, bands without a known formation year are left out.",
    active: (n: number) => `${nf(n)} active`,
    topGenres: "Top 10 genres by band count",
    noBandsIn: (u: string) => `No bands in ${u} for this selection.`,
    footOverlap: "A band counts once for every genre it plays, so the totals overlap.",
    unassigned: (n: number, c: string) =>
      ` ${nf(n)} bands from ${c} have no identifiable region and only appear in the country card.`,
    close: "Close",
    loadingList: "Loading bands…",
    genreSearchPh: (n: string) => `Search all ${n} genres here… e.g. sludge`,
    genreSearchAl: "Search genres in this area",
    genreMatches: (n: number) => `${n} matching ${plural(n, "genre", "genres")} · # = rank here`,
    genreNone: (q: string) => `No genre here matches “${q}”.`,
    topRel: (n: number) => `Top ${n} by relevance`,
    reviews: (n: number, avg: number) => `${nf(n)} ${plural(n, "review", "reviews")} · ${avg}%`,
    formedY: (y: number) => `formed ${y}`,
    noGenreBands: "No bands of this genre for this selection.",
    relFoot:
      "Relevance: number of Metal Archives reviews (55%), how early the band was added to the archive (30%), label size (10%) and how well documented it is (5%).",
    matchingHead: (n: number, q: string) => `${nf(n)} ${plural(n, "band", "bands")} matching “${q}”`,
    clearSearch: "Clear search",
    sorted: "sorted by relevance",
    showingMax: (n: number) => `Showing the ${n} most relevant. Narrow the search or the years to see the rest.`,
    noNames: (years: string) => `No band names contain that text${years ? " in these years" : ""}.`,
    loadingIndex: "Loading the band index…",
    levels: [
      ["Household names", "The most reviewed bands in the archive"],
      ["Well known", "Big names of every scene"],
      ["Fan territory", "You'll need to know your genres"],
      ["Deep cuts", "Respected, but far from the mainstream"],
      ["Underground", "Tape-trader knowledge"],
    ] as [string, string][],
    clues: ["Origin", "Formed", "Review", "Lineup", "Album", "Photo"],
    clueOf: (i: number, n: number) => `Clue ${i} of ${n}`,
    listenT: "Who's playing?",
    listenS: "Listen to the clip. Stuck? Reveal a clue: each one costs a point.",
    noMore: "No clues left",
    pastT: "Clues so far",
    allT: "The clues",
    gEyebrow: "Game mode",
    gTitle: "Name that band",
    gRules: (r: number, m: number) =>
      `${r} rounds. Each one starts with a 30-second clip. Name the band for ${m} points; every clue you reveal (city and country, year formed, a review, the lineup, an album, a photo) costs one. Clues come in random order, and a wrong guess reveals the next one.`,
    soundT: "Turn your sound on",
    soundS: "Every round starts with a song. Listen, then guess the band.",
    soundTest: "Test sound",
    difficulty: "Difficulty",
    backMap: "Back to map",
    start: "Start game",
    round: (r: number, total: number, score: number) => `Round <b>${r}</b>/${total} · Score <b>${score}</b>`,
    picking: "Picking a band…",
    noMusicT: "No music",
    noMusic: "Couldn't load a song for this level. Try again in a moment.",
    back: "Back",
    retry: "Try again",
    clipPlay: "Play the clip",
    clipPause: "Pause the clip",
    nowPlaying: "Now playing: who is it?",
    paused: "Paused. Press play to keep listening",
    tapPlay: "Press play to hear the song",
    reveal: "Reveal a clue · −1 point",
    worth: (n: number) => `This band is worth <b>${n}</b> ${plural(n, "point", "points")} now.`,
    guessPh: "Band name…",
    guessAl: "Your guess",
    guess: "Guess",
    giveUp: "Give up",
    notIt: (v: string) => `Not “${v}”. Here's another clue.`,
    pts: (n: number) => (n ? `+${n} ${plural(n, "point", "points")}` : "No points this time"),
    quit: "Quit",
    finalBtn: "See final score",
    next: "Next round →",
    final: "Final score",
    verdicts: [
      "Encyclopaedia Metallum in human form.",
      "True. Kvlt. Fan.",
      "Solid. Go dig some more crates.",
      "Poser alert, but there's hope.",
      "Back to the record store.",
    ],
    changeLevel: "Change level",
    again: "Play again",
    reviewFrom: (p: number) => `from a ${p}% review`,
    photoNa: "Photo unavailable",
    bandPhoto: "Band photo",
    coverOf: (a: string) => `Cover of ${a}`,
    logoOf: (n: string) => `${n} logo`,
    bandPhotoOf: (n: string) => `${n} band photo`,
    selfTitled: "(self-titled)",
    lineupHdr: (h: string) => `(${h.toLowerCase()})`,
  };
}

export type Messages = ReturnType<typeof english>;

function spanish(nf: (n: number) => string): Messages {
  return {
    loading: "Cargando…",
    searchPh: "Buscar bandas… p. ej. machete",
    searchAl: "Buscar bandas por nombre",
    formed: "Formadas",
    from: "desde",
    to: "hasta",
    formedFromAl: "Formadas desde el año",
    formedToAl: "Formadas hasta el año",
    yearsAl: "Año de formación",
    clearYears: "Quitar años",
    presetsAl: "Rangos rápidos",
    countryPh: "Buscar país…",
    countryAl: "Buscar país",
    mapAl: "Mapa del mundo coloreado según el género de metal con más bandas en cada país",
    loadingBands: "Cargando 202.692 bandas…",
    credData: "Datos",
    credGeo: "Geografía",
    zoomIn: "Acercar",
    zoomOut: "Alejar",
    resetView: "Restablecer vista",
    playerAl: "Reproductor de fragmentos",
    modeTitle: "Cambiar entre el mapa y el juego de adivinar bandas",
    modeGame: "Juego",
    modeMap: "← Mapa",
    langTitle: "Language: view in English",
    intl: "Internacional (sin un único país)",
    status: ["", "Activa", "En pausa", "Separada", "Estado desconocido", "Cambió de nombre", "En disputa"],
    plNone: "Sin fragmento disponible",
    plPause: "Pausa",
    plPlay: "Escuchar 30 s",
    npClose: "Cerrar reproductor",
    npNext: "Siguiente canción",
    npStop: "Parar y cerrar",
    npPlay: "Reproducir",
    npPause: "Pausa",
    npBlocked: "El navegador ha bloqueado la reproducción",
    npUnavail: "Fragmentos no disponibles aquí (red bloqueada)",
    npVia: "fragmento vía Apple Music",
    maSearch: "Ver estas bandas en Metal Archives (con los mismos filtros)",
    otherGenre: "Otro género",
    yrRange: (a, b) => `formadas ${a}–${b}`,
    yrFrom: (a) => `formadas en ${a} o después`,
    yrTo: (b) => `formadas en ${b} o antes`,
    nameContains: (q) => `nombre contiene “${q}”`,
    matching: (q) => `que contienen “${q}”`,
    allEras: "todas las épocas",
    bands: (n) => `${nf(n)} ${plural(n, "banda", "bandas")}`,
    subRegion: "vista por regiones · aleja el zoom para volver a los países",
    subHint: "pulsa un país o acerca el zoom para ver regiones",
    legendT: "Género principal · por nº de bandas",
    legendBands: (n) => `${nf(n)} bandas · `,
    countries: (n) => `${n} ${plural(n, "país", "países")}`,
    legendNone: "No hay bandas en esta selección",
    tipNone: "sin bandas",
    tipNoneSel: "sin bandas en esta selección",
    filterNote: " Con un filtro de años se excluyen las bandas sin año de formación conocido.",
    active: (n) => `${nf(n)} ${plural(n, "activa", "activas")}`,
    topGenres: "Los 10 géneros con más bandas",
    noBandsIn: (u) => `No hay bandas en ${u} para esta selección.`,
    footOverlap: "Una banda cuenta una vez por cada género que toca, así que los totales se solapan.",
    unassigned: (n, c) =>
      ` ${nf(n)} bandas de ${c} no tienen una región identificable y solo aparecen en la ficha del país.`,
    close: "Cerrar",
    loadingList: "Cargando bandas…",
    genreSearchPh: (n) => `Busca entre sus ${n} géneros… p. ej. sludge`,
    genreSearchAl: "Buscar géneros en esta zona",
    genreMatches: (n) => `${n} ${plural(n, "género coincide", "géneros coinciden")} · # = puesto aquí`,
    genreNone: (q) => `Ningún género de aquí coincide con “${q}”.`,
    topRel: (n) => `Las ${n} más relevantes`,
    reviews: (n, avg) => `${nf(n)} ${plural(n, "reseña", "reseñas")} · ${avg}%`,
    formedY: (y) => `formada en ${y}`,
    noGenreBands: "No hay bandas de este género para esta selección.",
    relFoot:
      "Relevancia: número de reseñas en Metal Archives (55%), lo pronto que se añadió la banda al archivo (30%), tamaño del sello (10%) y lo documentada que está (5%).",
    matchingHead: (n, q) => `${nf(n)} ${plural(n, "banda contiene", "bandas contienen")} “${q}”`,
    clearSearch: "Borrar búsqueda",
    sorted: "por relevancia",
    showingMax: (n) => `Se muestran las ${n} más relevantes. Afina la búsqueda o los años para ver el resto.`,
    noNames: (years) => `Ningún nombre de banda contiene ese texto${years ? " en esos años" : ""}.`,
    loadingIndex: "Cargando el índice de bandas…",
    levels: [
      ["Clásicos absolutos", "Las bandas con más reseñas del archivo"],
      ["Muy conocidas", "Grandes nombres de cada escena"],
      ["Terreno de fans", "Tendrás que dominar los géneros"],
      ["Para entendidos", "Respetadas, pero lejos del mainstream"],
      ["Underground", "Sabiduría de tape-trader"],
    ],
    clues: ["Origen", "Formada", "Reseña", "Formación", "Disco", "Foto"],
    clueOf: (i, n) => `Pista ${i} de ${n}`,
    listenT: "¿Quién suena?",
    listenS: "Escucha el fragmento. ¿Atascado? Destapa una pista: cada una cuesta un punto.",
    noMore: "No quedan pistas",
    pastT: "Pistas hasta ahora",
    allT: "Las pistas",
    gEyebrow: "Modo juego",
    gTitle: "Adivina la banda",
    gRules: (r, m) =>
      `${r} rondas. Cada una empieza con un fragmento de 30 segundos. Si aciertas la banda ganas ${m} puntos; cada pista que destapes (ciudad y país, año de formación, una reseña, la formación, un disco, una foto) resta uno. Las pistas salen en orden aleatorio y un fallo destapa la siguiente.`,
    soundT: "Sube el volumen",
    soundS: "Cada ronda empieza con una canción. Escucha y adivina la banda.",
    soundTest: "Probar sonido",
    difficulty: "Dificultad",
    backMap: "Volver al mapa",
    start: "Empezar",
    round: (r, total, score) => `Ronda <b>${r}</b>/${total} · Puntos <b>${score}</b>`,
    picking: "Eligiendo banda…",
    noMusicT: "Sin música",
    noMusic: "No se ha podido cargar una canción para este nivel. Prueba de nuevo en un momento.",
    back: "Volver",
    retry: "Reintentar",
    clipPlay: "Reproducir el fragmento",
    clipPause: "Pausar el fragmento",
    nowPlaying: "Sonando: ¿quién es?",
    paused: "En pausa. Pulsa play para seguir escuchando",
    tapPlay: "Pulsa play para escuchar la canción",
    reveal: "Destapar pista · −1 punto",
    worth: (n) => `Esta banda vale <b>${n}</b> ${plural(n, "punto", "puntos")} ahora.`,
    guessPh: "Nombre de la banda…",
    guessAl: "Tu respuesta",
    guess: "Probar",
    giveUp: "Me rindo",
    notIt: (v) => `No es “${v}”. Ahí va otra pista.`,
    pts: (n) => (n ? `+${n} ${plural(n, "punto", "puntos")}` : "Esta vez sin puntos"),
    quit: "Salir",
    finalBtn: "Ver puntuación final",
    next: "Siguiente ronda →",
    final: "Puntuación final",
    verdicts: [
      "La Encyclopaedia Metallum hecha persona.",
      "True. Kvlt. Fan.",
      "Nada mal. Sigue rebuscando en las cubetas.",
      "Alerta poser, pero hay esperanza.",
      "De vuelta a la tienda de discos.",
    ],
    changeLevel: "Cambiar nivel",
    again: "Jugar otra vez",
    reviewFrom: (p) => `de una reseña con un ${p}%`,
    photoNa: "Foto no disponible",
    bandPhoto: "Foto de la banda",
    coverOf: (a) => `Portada de ${a}`,
    logoOf: (n) => `Logo de ${n}`,
    bandPhotoOf: (n) => `Foto de ${n}`,
    selfTitled: "(homónimo)",
    lineupHdr: (h) =>
      /last known/i.test(h)
        ? "(última formación conocida)"
        : /past/i.test(h)
          ? "(antiguos miembros)"
          : `(${h.toLowerCase()})`,
  };
}

type MessageArgs<K extends keyof Messages> = Messages[K] extends (...args: infer A) => string ? A : [];
type MessageValue<K extends keyof Messages> = Messages[K] extends (...args: never[]) => infer R ? R : Messages[K];
export type Translate = <K extends keyof Messages>(key: K, ...args: MessageArgs<K>) => MessageValue<K>;

export function messages(lang: Lang, nf: (n: number) => string): Messages {
  return lang === "es" ? spanish(nf) : english(nf);
}

export function translator(lang: Lang, nf: (n: number) => string): Translate {
  const table = messages(lang, nf);
  return ((key: keyof Messages, ...args: unknown[]) => {
    const value = table[key];
    return typeof value === "function" ? (value as (...a: unknown[]) => string)(...args) : value;
  }) as Translate;
}

const isLang = (value: unknown): value is Lang => LANGS.includes(value as Lang);

/** The saved choice, else the first supported browser language, else English. */
export function detectLang(saved: string | null, browserLanguages: readonly string[]): Lang {
  if (isLang(saved)) return saved;
  return browserLanguages.map((l) => l.slice(0, 2).toLowerCase()).find(isLang) ?? "en";
}

export function savedLang(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage blocked (private mode, sandboxed frames)
  }
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // storage blocked: the choice lasts until the reload only
  }
}
