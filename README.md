# Metal Atlas

Mapa interactivo de las ~200.000 bandas de [Encyclopaedia Metallum (Metal Archives)](https://www.metal-archives.com), con un modo juego para adivinar bandas por su música.

Es una web estática: un único `index.html` más ficheros JSON precalculados. No necesita servidor ni base de datos; se publica sola en **GitHub Pages** con cada commit a `main` (https://miguelsr.js.org/metal-atlas/).

---

## Índice

1. [Qué hace la web](#qué-hace-la-web)
2. [Estructura del proyecto](#estructura-del-proyecto)
3. [Cómo se generan los datos (pipeline)](#cómo-se-generan-los-datos-pipeline)
4. [Comandos](#comandos)
5. [Tareas habituales](#tareas-habituales)
6. [Formato de los datos](#formato-de-los-datos)
7. [Cómo funciona por dentro](#cómo-funciona-por-dentro)
8. [Límites y problemas conocidos](#límites-y-problemas-conocidos)

---

## Qué hace la web

La página tiene **dos modos**, que se alternan con el botón pequeño junto al título (**Game** / **← Map**). El modo mapa es el de por defecto.

### Modo mapa

- **Mapa del mundo coloreado por género principal**: cada país toma el color del género con más bandas. La leyenda muestra los géneros y cuántos países lidera cada uno.
- **Filtro por año de formación** (desde / hasta, con rangos rápidos). Con un filtro activo, las bandas sin año conocido quedan fuera.
- **Vista por regiones**: al hacer clic en un país o acercar el zoom, el mapa se divide en regiones (estados, provincias, comunidades…). Las bandas cuya ubicación no se pudo situar solo aparecen en la ficha del país.
- **Ficha de país o región** (al hacer clic):
  - nº de bandas y activas;
  - top 10 de géneros;
  - **buscador predictivo de géneros**, para encontrar cualquier subgénero aunque no esté en el top 10. Los resultados salen ordenados por nº de bandas.
- **Listado de bandas de un género**, ordenado por relevancia (ver [Relevancia](#relevancia)), con año, estado, reseñas y enlace a Metal Archives.
- **Buscador de bandas por nombre** (arriba): busca en las 200.000 bandas.
- **Reproductor discreto**: el icono ▶ junto a cada banda reproduce un fragmento de 30 s de Apple Music en la propia página. No suena nada hasta que se pulsa.
- **Buscador de países** y controles de zoom.

### Modo juego («Name that band»)

- **10 rondas.** Cada una empieza con un fragmento de 30 s de una canción y hay que escribir el nombre de la banda (con sugerencias mientras escribes).
- **Puntos:** acertar sin pistas vale 7 puntos. Cada pista extra cuesta uno, y un fallo destapa automáticamente la siguiente. Las pistas, en orden:
  1. País
  2. Año de formación
  3. Fragmento de una reseña (sin el nombre de la banda ni del disco)
  4. Formación (miembros)
  5. Título de un disco
  6. Foto de la banda
- **Si una banda no tiene alguna pista** (p. ej. no hay foto), esa pista se salta gratis.
- **La respuesta es tolerante:** ignora mayúsculas, acentos, signos y pequeñas erratas.
- **Al resolver la ronda** aparecen el logo, la foto de la banda y la portada del disco que sonaba.
- **5 niveles de dificultad**, según el puesto de la banda en el ranking de relevancia:

  | Nivel | Bandas (puesto) |
  |---|---|
  | 1 · Clásicos absolutos | 1 – 250 |
  | 2 · Muy conocidas | 251 – 800 |
  | 3 · Terreno de fans | 801 – 2.000 |
  | 4 · Para entendidos | 2.001 – 3.800 |
  | 5 · Underground | 3.801 – 6.000 |

- **Aviso de sonido** antes de empezar, con un botón «Probar sonido» (un acorde de guitarra sintetizado), porque mucha gente no se daba cuenta de que tenía que sonar música.

### Idioma

La interfaz está en **inglés y español**. Se elige sola según el idioma del navegador, y se puede cambiar con el botón **EN · ES**; la elección se recuerda. Los nombres de países se traducen automáticamente con la API `Intl` del navegador.

---

## Estructura del proyecto

```
~/metal_archives_bands.json      ← dataset maestro: todas las bandas (fuera de la carpeta del proyecto)

~/metal-archives/
├── README.md
├── scraper/                     ← descarga de datos de Metal Archives e iTunes
│   ├── scrape.py                  búsqueda avanzada completa de MA → pages/
│   ├── merge.py                   pages/ → ~/metal_archives_bands.json
│   ├── probe.py                   utilidad para probar consultas a la búsqueda de MA
│   ├── members.py                 formación, foto, logo y fragmento de reseña (top 6.000) → members/
│   ├── verify.py                  verifica en iTunes la banda correcta y guarda sus fragmentos → itunes/, disco/
│   ├── night.sh                   proceso largo: verify.py en bucle + reconstrucción cada 30 min
│   ├── pages/                     respuestas crudas de la búsqueda de MA (10 «jobs»)
│   ├── members/<id>.json          extras de cada banda del juego
│   ├── disco/<id>.json            discografía de MA (para verificar y para la pista «Disco»)
│   ├── itunes/<id>.json           resultado de la verificación en iTunes
│   └── *.log                      registros de members, verify y night
└── map/                         ← construcción y publicación de la web
    ├── reviews.py                 lista completa de reseñas de MA → reviews_pages/, reviews_by_band.json
    ├── regions.py                 sitúa cada banda en una región de su país → regions_out/
    ├── build.py                   genera los datos del mapa → site/
    ├── game.py                    genera los datos del juego → site/game.json
    ├── make_netlify.py            copia site/ en netlify/, lista para publicar
    ├── update.py                  actualización incremental (bandas nuevas/cambiadas + reseñas nuevas)
    ├── update_state.json          fecha de la última actualización
    ├── reviews_pages/             lista completa de reseñas (scrape inicial)
    ├── reviews_new/               reseñas añadidas por update.py
    ├── reviews_by_band.json       nº de reseñas y suma de notas por banda
    ├── geo_dl/                    geografía descargada: Natural Earth (regiones) y GeoNames (ciudades)
    ├── regions_out/               banda → región, y la geometría de regiones por país
    ├── site/                      la web (versión para artifacts de claude.ai)
    │   ├── index.html               toda la aplicación: HTML + CSS + JS
    │   ├── index.json               resumen por país: géneros × años
    │   ├── bands.json               índice de todas las bandas, ordenado por relevancia
    │   ├── c/<n>.json               bandas de cada país
    │   ├── r/<n>.json               regiones de cada país (geometría + resúmenes)
    │   ├── game.json                bandas del juego, con sus pistas y fragmentos
    │   └── countries-50m.json       mapa del mundo (TopoJSON)
    └── netlify/                   copia local de lo que se publica (generada; no se sube al repo)

.github/workflows/pages.yml      ← publica map/site en GitHub Pages con cada push a main
```

> **`site/` frente a `netlify/`:** `site/index.html` está escrito sin `<html>`, `<head>` ni `<body>`, porque los artifacts de claude.ai los añaden solos. `make_netlify.py` lo envuelve en un documento HTML completo y enlaza (hard links) los JSON, así que no ocupa espacio extra. **Se edita `site/`; lo que se publica es el resultado de `make_netlify.py`**, que GitHub genera solo en cada push. El nombre `netlify` es histórico: la web estuvo antes en Netlify.

---

## Cómo se generan los datos (pipeline)

```
Metal Archives ──scrape.py──► pages/ ──merge.py──► ~/metal_archives_bands.json ─┬─ regions.py ─► regions_out/ ─┐
               ──reviews.py─► reviews_by_band.json ─────────────────────────────┴─────────── build.py ◄──────┘
                                                                                                │
                                                                                     site/ (mapa: index, c/, r/, bands.json)
                                                                                                │
Metal Archives ──members.py─► members/  ─┐                                                      │
iTunes ─────────verify.py───► itunes/, disco/ ─┴──────── game.py ──► site/game.json             │
                                                                          │                     │
                                                                          └─ make_netlify.py ◄──┘ ──► netlify/
```

| Paso | Script | Qué hace | Duración aprox. |
|---|---|---|---|
| 1 | `scraper/scrape.py` | Descarga la búsqueda avanzada de MA en 10 pasadas (por estado, ubicación, temas, notas y año), porque cada pasada solo devuelve algunas columnas. Se puede reanudar. | horas (una sola vez) |
| 2 | `scraper/merge.py` | Une las 10 pasadas en una ficha por banda. | segundos |
| 3 | `map/reviews.py` | Descarga la lista alfabética de todas las reseñas (~700 páginas) y cuenta reseñas y nota media por banda. | una sola vez |
| 4 | `map/regions.py` | Sitúa cada banda en una región a partir de su campo «Location», usando GeoNames y Natural Earth. | ~15 s |
| 5 | `map/build.py` | Normaliza géneros, resuelve las bandas «International», calcula la relevancia y escribe los JSON de la web. | ~30 s |
| 6 | `scraper/members.py` | Para las 6.000 bandas más relevantes: formación, foto, logo y un fragmento de reseña sin nombres. | ~3 h la primera vez |
| 7 | `scraper/verify.py` | Busca cada banda del juego en iTunes y confirma cuál es la buena comparando discos (ver [Verificación](#verificación-itunes)). | ~20 h la primera vez (a una llamada cada 6 s) |
| 8 | `map/game.py` | Junta todo en `site/game.json`. | segundos |
| 9 | `map/make_netlify.py` | Genera `netlify/`. | segundos |

Los pasos 1–3 y 6 solo hacen falta una vez. Después, `update.py` mantiene los datos al día de forma incremental.

---

## Comandos

Todo es Python 3 de la librería estándar (sin dependencias) y `curl`. Las rutas son relativas a `~/metal-archives`.

### Uso habitual

| Comando | Para qué |
|---|---|
| `cd map && python3 update.py` | **Actualizar todo** con los cambios de Metal Archives desde la última vez y regenerar `netlify/`. |
| `cd map && python3 update.py --dry-run` | Ver cuántas bandas y reseñas han cambiado, sin tocar nada. |
| `cd map && python3 update.py --since 2026-11-01` | Actualizar desde una fecha concreta. |
| `cd map && python3 game.py && python3 make_netlify.py` | Regenerar el juego y la carpeta de publicación (p. ej. tras verificar más bandas). |
| `cd map && python3 make_netlify.py` | Regenerar solo `netlify/` (p. ej. tras editar `site/index.html`). |
| `cd scraper && nohup caffeinate -ims bash night.sh > night.log 2>&1 &` | Lanzar la verificación de iTunes en segundo plano, sin que el Mac se duerma. |

### Referencia completa

| Script | Argumentos | Notas |
|---|---|---|
| `scraper/scrape.py [job…]` | jobs: `status1`…`status6`, `location`, `themes`, `notes`, `year` (por defecto, todos) | Variable `DELAY` (por defecto 0.8 s entre peticiones). Se puede reanudar. |
| `scraper/merge.py <salida.json>` | ruta del dataset | Normalmente `~/metal_archives_bands.json`. |
| `scraper/probe.py "<query>"` | parámetros de la búsqueda avanzada | Muestra cuántos resultados da y qué columnas devuelve. |
| `scraper/members.py [N=6000] [hilos=3]` | | Se salta las bandas ya descargadas, así que relanzarlo solo baja las que falten. |
| `scraper/verify.py [N=6000] [hilos=2]` | variable `ITUNES_GAP` (s entre llamadas a iTunes; por defecto 3.2) | Se salta las ya verificadas. Si iTunes responde 403, espera de 15 a 30 min. |
| `scraper/night.sh` | variable `ITUNES_GAP` (por defecto 6) | Hasta 8 pasadas de `verify.py`. Cada 30 min regenera `game.json` y `netlify/`. |
| `map/reviews.py` | | Se puede reanudar. Para tener las reseñas al día basta con `update.py`. |
| `map/regions.py` | | Necesita `geo_dl/` (ver abajo). |
| `map/build.py <carpeta>` | normalmente `site` | Sin argumento, solo muestra estadísticas de prueba. |
| `map/game.py [--mixed]` | | Sin opción: **solo bandas verificadas**. Con `--mixed`: también las no verificadas, con búsqueda en directo. |
| `map/make_netlify.py` | | |
| `map/update.py [--dry-run] [--since AAAA-MM-DD]` | | Ver [Actualizar los datos](#actualizar-los-datos). |

**`geo_dl/`** contiene `admin1.geojson` (Natural Earth 10m, divisiones administrativas de primer nivel), `cities1000.txt` y `admin1Codes.txt` (GeoNames). Ya están descargados.

---

## Tareas habituales

### Publicar una nueva versión

Basta con hacer commit y push de los cambios en `map/site/` (y del código):

```bash
cd ~/metal-archives
git add -A && git commit -m "Actualizar datos" && git push
```

GitHub Actions ejecuta `map/make_netlify.py` y publica el resultado en https://miguelsr.js.org/metal-atlas/ en uno o dos minutos. Para ver el progreso o los errores: pestaña **Actions** del repo, o `gh run list`.

`.gitignore` deja fuera del repo las descargas y cachés (unos 500 MB, regenerables con los scripts), los logs y `map/netlify/`. **Esas cachés solo existen en este Mac**: la verificación de iTunes (`scraper/itunes/`) costó unas 20 horas, así que conviene tener copia de seguridad de `~/metal-archives` y de `~/metal_archives_bands.json`.

### Actualizar los datos

```bash
cd ~/metal-archives/map
python3 update.py --dry-run     # opcional: ver cuánto ha cambiado
nohup caffeinate -ims python3 update.py > update.log 2>&1 &
tail -f update.log              # seguir el progreso; termina con «done…»
```

Qué hace `update.py`:

1. **Detecta los cambios** leyendo dos listados de Metal Archives, mes a mes y página a página (200 por página, de más nuevo a más antiguo), hasta llegar a la fecha de la última actualización:
   - *What's new* (`archives/ajax-band-list/selection/AAAA-MM/by/created`)
   - *What's updated* (`…/by/modified`)
2. **Detecta las reseñas nuevas** con la lista mensual de reseñas (`review/ajax-list-browse/by/date/selection/AAAA-MM`). Cada reseña tiene un id, así que las ya contadas se saltan. Así se actualiza el recuento de **todas** las bandas, no solo de las modificadas.
3. **Descarga la ficha** de cada banda nueva o modificada (1 petición), además de:
   - **bandas nuevas:** una búsqueda exacta por nombre para sacar sus alias (a.k.a.), que solo aparecen ahí;
   - **bandas del juego:** formación, foto y logo (de la misma ficha) y su discografía.
   - Las bandas que dan 404 (borradas de MA) se eliminan.
4. **Guarda** `~/metal_archives_bands.json` (dejando una copia del anterior en `~/metal_archives_bands.json.bak`) y `reviews_by_band.json`.
5. **Reconstruye:** `regions.py` → `build.py` → `members.py` y `verify.py` (solo las bandas que entren nuevas en el top 6.000) → `game.py` → `make_netlify.py`.
6. **Apunta en `update_state.json`** la fecha del cambio más reciente.

**Cómo sabe desde cuándo actualizar:** por `map/update_state.json` (`{"since": "AAAA-MM-DD HH:MM"}`, en hora de Metal Archives, unas 6 h por detrás de España).
- **Siempre** empieza un día antes de esa fecha, por seguridad: repasar una banda dos veces no hace daño.
- **Si el fichero no existe**, usa el 21/11/2026, la fecha del scrape completo.
- **Para forzar otra fecha**, usa `--since`.

Duración: algo más de 1 s por banda modificada (petición + pausa de cortesía de 0,8 s), más unos minutos de reconstrucción. La primera ejecución (22/11/2026, ~2.000 bandas cambiadas en dos días) tardó unos 45 minutos. En noviembre de 2026 cambiaban ~1.000 bandas al día, así que conviene actualizar a menudo para que cada pasada sea corta.

### Verificar más bandas del juego en iTunes

```bash
cd ~/metal-archives/scraper
nohup caffeinate -ims bash night.sh > night.log 2>&1 &
tail night.log        # una línea «levels: […]» cada 30 min
tail verify.log       # avisos de bloqueo de iTunes (403)
```

Puede ir en paralelo con `update.py`: usan servidores distintos.

### Cambiar textos, colores o comportamiento de la web

Todo está en `map/site/index.html`. Después ejecuta `python3 map/make_netlify.py`.

- **Textos:** en el diccionario `TX` (claves `en` y `es`) al principio del script. Se usan con `t("clave", …)`.
- **Niveles del juego:** en `LEVELS` de `game.py`. Sus nombres, en `TX.*.levels`.

---

## Formato de los datos

### `~/metal_archives_bands.json` (dataset maestro)

Lista de bandas, una ficha por banda:

```json
{"id": 84, "name": "Yngwie Malmsteen", "aka": "Rising Force, …", "aka_list": ["Rising Force", …],
 "url": "https://www.metal-archives.com/bands/Yngwie_Malmsteen/84",
 "genre": "Neoclassical Power Metal/Shred", "country": "Sweden",
 "location": "Stockholm (early); Miami, Florida, United States (later)",
 "status": "Active", "formed_in": 1978, "themes": "Society, War, …",
 "label": "Rising Force Records",            // "000INDIE000" = sin sello
 "notes": "…", "notes_truncated": true, "contact_emails": null}
```

### Ficheros de la web (`site/`)

Van compactados (arrays en vez de objetos) para que pesen poco.

| Fichero | Contenido |
|---|---|
| `index.json` | `genres`: lista de géneros (por nº de bandas). `countries[]`: `{name, file, r (tiene regiones), y: {año: [bandas, activas]}, g: {género: {año: nº}}}`. Con esto el mapa calcula colores y filtros sin cargar las bandas. |
| `c/<n>.json` | Bandas de un país: `labels` y `rows` = `[id, nombre, slug\|0, año, estado, idx sello, género literal, [idx géneros], nº reseñas, nota media, [regiones]]`, ordenadas por relevancia. |
| `r/<n>.json` | Regiones de un país: nombres, geometría (rellenos y bordes) y el mismo resumen género × año por región. |
| `bands.json` | Índice global para el buscador y el juego: columnas paralelas `n` (nombres), `y` (años), `a` (activas), `g` (géneros), `l` (país + regiones), `id`, `s` (slugs no estándar). Ordenado por relevancia. |
| `game.json` | `levels`: 5 listas de índices. `b`: filas `[id, nombre, slug, año, países, miembros, cabecera de formación, foto, reseña, % reseña, logo, id artista iTunes, [discos], [[url mp3, canción, disco, portada], …], ciudad]`. Hasta 5 canciones por banda, de discos distintos, con las URLs acortadas (`game.py` quita el dominio y `index.html` lo vuelve a poner). |

### Cachés del scraper

| Fichero | Contenido |
|---|---|
| `members/<id>.json` | `{h: cabecera, m: [[nombre, instrumento]…], p: foto, lg: logo, r: fragmento de reseña, ra: disco reseñado, rs: nota}` |
| `disco/<id>.json` | `[[id disco, título, tipo, año], …]` |
| `itunes/<id>.json` | `{a: id artista, c: [ids de discos que coinciden], n: [títulos que coinciden], t: [[mp3, canción, disco, portada]…], v: 3}`. Si `t` está vacío, no se encontró en iTunes. |

---

## Cómo funciona por dentro

### Géneros

El género de MA es texto libre («Crust Punk (early); Progressive Sludge/Groove Metal (later)»). `build.py` lo descompone en géneros simples:

- **separa** por épocas (`;`), comas y barras;
- **quita** «(early)», «with … influences», etc.;
- **completa** los fragmentos sueltos: «Sludge/Groove Metal» → «Sludge Metal» + «Groove Metal».

Una banda cuenta en cada uno de sus géneros, así que los totales por género se solapan.

### Países y regiones

- **Bandas «International»:** se asignan a los países que se reconocen en su campo de ubicación.
- **Regiones:** `regions.py` busca la ubicación de cada banda en la lista de ciudades de GeoNames. Las coordenadas de la ciudad se sitúan en un polígono regional de Natural Earth.
- **Países agrupados:** en algunos países (Reino Unido, España, Italia, Francia…) Natural Earth trae unidades demasiado pequeñas, así que se agrupan por región.

### Relevancia

Sirve para ordenar los listados y para los niveles del juego. Se calcula en `build.py`:

| Peso | Señal | Por qué |
|---|---|---|
| 55 % | nº de reseñas en MA (logarítmico) | la mejor medida de popularidad disponible |
| 30 % | antigüedad en MA (id bajo = alta temprana) | las primeras bandas registradas (2002–2005) son mayoritariamente las clásicas |
| 10 % | tamaño del sello (bandas del sello en el dataset) | sellos grandes, bandas más conocidas |
| 5 % | notas largas | las bandas importantes están mejor documentadas |

### Fragmentos de audio

Vienen de la **API de búsqueda de iTunes**: es gratuita, no necesita clave y permite llamadas desde el navegador. Cada canción tiene un mp3/m4a de 30 s en `audio-ssl.itunes.apple.com`. Hay dos formas de conseguirlo:

- **Fragmento guardado** (bandas verificadas): la URL del audio ya va en `game.json`, así que el navegador no consulta la API de iTunes. Siempre es la banda correcta. En la pestaña *Network* solo se ve una URL opaca, y el fichero no lleva artista ni título.
- **Búsqueda en directo** (resto de bandas, y el ▶ del modo mapa): el navegador busca el artista por nombre en iTunes y coge sus canciones. Con nombres repetidos (hay más de 40 «Hydra» en iTunes) puede sonar otra banda.

**El juego solo usa bandas verificadas** (5.099 de las 6.000 a 23/11/2026), así que siempre suena la banda correcta y el navegador no consulta la API de iTunes durante la partida. Las ~900 restantes no aparecen en iTunes con una discografía que coincida, casi siempre porque no están en Apple Music.

Con `game.py --mixed` entrarían también esas bandas, con búsqueda en directo. Se dejó de usar porque daba «Sin música» y homónimos. La búsqueda en directo sigue existiendo para el ▶ del modo mapa.

### Verificación iTunes

`verify.py` decide cuál de los artistas de iTunes con el mismo nombre es la banda de MA:

1. Descarga la discografía de MA.
2. Busca en iTunes todos los artistas con exactamente ese nombre. Primero los de géneros metal/rock, hasta 12.
3. Con una sola llamada más, pide las canciones de todos esos candidatos.
4. Gana el candidato con más discos cuyo título coincide con la discografía de MA. Los títulos se normalizan sin «Remastered», «Deluxe», paréntesis, etc. Un disco homónimo solo cuenta si además coincide el año (±1).
5. Guarda hasta 12 canciones, **solo de los discos que coinciden**. Así, si iTunes mezcla en la misma página a dos bandas homónimas (pasaba con Graveyard de España y de Suecia), solo suena la buena.

### Fragmento de reseña

`members.py` toma la reseña mejor valorada de la banda y busca un trozo de 140–320 caracteres, formado por frases completas, que no mencione el nombre de la banda ni el del disco. Prefiere los párrafos centrales, que suelen describir el sonido.

---

## Límites y problemas conocidos

- **iTunes limita mucho las peticiones.** Oficialmente permite unas 20 por minuto por IP, pero con tráfico continuo bloquea antes (error 403) y el bloqueo dura bastante.
  - **Esto afecta también a tu navegador**, porque comparte la IP: mientras se verifica, el ▶ del modo mapa puede fallar en casa. Los visitantes de la web no se ven afectados.
  - `verify.py` va a una llamada cada 6 s y, ante un 403, se detiene 15–30 min.
  - Si hiciera falta más velocidad, la vía oficial es la Apple Music API, que exige una cuenta de Apple Developer.
- **Búsqueda en directo (▶ del modo mapa):** puede sonar un homónimo o no encontrarse música.
- **`game.json` es legible:** un jugador curioso podría buscar ahí la URL del audio que suena. Se ofuscó en su día y se quitó a propósito.
- **`update.py` no detecta:**
  - alias nuevos de bandas que ya existían (solo los saca para bandas nuevas);
  - reseñas borradas (solo suma las nuevas).
- **Fechas de Metal Archives:** los listados usan la hora del servidor de MA. Por eso cada actualización repasa un día de margen.
- **Uso respetuoso:** todos los scripts que consultan MA esperan ~0,8 s entre peticiones y reintentan con espera creciente. No hay que bajar esos tiempos.

---

**Créditos de datos:** [Encyclopaedia Metallum](https://www.metal-archives.com) · [Natural Earth](https://www.naturalearthdata.com) · [GeoNames](https://www.geonames.org) (CC BY 4.0) · fragmentos de audio vía Apple Music / iTunes Search API.
