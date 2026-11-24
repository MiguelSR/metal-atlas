import { describe, expect, it } from "vitest";

import { translator } from "../src/i18n";
import { type OracleFile, OracleIndex } from "../src/oracle/data";
import { describeQuery } from "../src/oracle/describe";
import { OracleEngine, roleNeedle } from "../src/oracle/engine";
import { type Query, extractJson, parseQuery } from "../src/oracle/query";
import { type Vocabulary, countriesIn, refine, themeWord, yearsIn } from "../src/oracle/refine";

/** Five bands, most relevant first. */
function oracleFile(): OracleFile {
  return {
    v: 1,
    genres: ["Black Metal", "Death Metal", "Thrash Metal"],
    countries: ["Norway", "Spain", "United States"],
    dicts: {
      genre: ["Black Metal", "Thrash Metal", "Death/Thrash Metal", "Melodic Death Metal"],
      location: ["Bergen, Vestland", "Murcia", "Bay Area, California", "Seville, Andalusia"],
      themes: ["Satanism, Darkness", "War, Death", "Tolkien, Fantasy"],
      label: ["Nuclear Blast", "Century Media"],
    },
    id: [10, 20, 30, 40, 50],
    name: ["Darkthrone", "Slayer", "Muerte", "Slayer", "Ángeles"],
    slug: {},
    year: [1986, 1981, 1984, 1995, 0],
    status: [1, 3, 1, 1, 0],
    genre: [0, 1, 2, 3, 1],
    g: [[0], [2], [1, 2], [1], [2]],
    country: [[0], [2], [1], [1], [1]],
    location: [0, 2, 1, 3, -1],
    themes: [0, 1, 1, 2, -1],
    label: [1, 0, -1, 0, -1],
    reviews: [120, 300, 2, 4, 0],
    rating: [85, 80, 60, 95, 0],
    lineups: {
      "0": [
        "Current",
        [
          ["Fenriz", "Drums, Vocals"],
          ["Nocturno Culto", "Guitars, Bass, Vocals"],
        ],
      ],
      "1": [
        "Last known",
        [
          ["Tom Araya", "Bass, Vocals"],
          ["Kerry King", "Guitars"],
          ["Paul Bostaph", "Drums"],
        ],
      ],
    },
    albums: {
      "1": [
        [1, "Show No Mercy", "Full-length", 1983],
        [2, "Haunting the Chapel", "EP", 1984],
        [3, "Reign in Blood", "Full-length", 1986],
      ],
    },
  };
}

const index = new OracleIndex(oracleFile());
const engine = new OracleEngine(index);
const run = (query: Query) => engine.run(query).answer;

describe("query parsing", () => {
  it("keeps valid fields and drops the rest", () => {
    const query = parseQuery(
      '```json\n{"intent":"bands","genre":"thrash","country":" Spain ","formedFrom":"1980","status":"Alive","limit":500,"x":1}\n```',
    );
    expect(query).toEqual({ intent: "bands", genre: ["thrash"], country: "Spain", formedFrom: 1980, limit: 50 });
  });

  it("turns a ranking without grouping into a list, and rejects non-queries", () => {
    expect(parseQuery({ intent: "top" }).intent).toBe("bands");
    expect(() => parseQuery('{"intent":"dance"}')).toThrow();
    expect(() => extractJson("no idea")).toThrow();
  });
});

describe("engine", () => {
  it("filters by genre words, country (in Spanish too), years and status", () => {
    expect(run({ intent: "bands", genre: ["thrash"], country: "España" })).toEqual({
      kind: "bands",
      total: 2,
      rows: [2, 4],
    });
    expect(
      run({ intent: "count", genre: ["thrash"], formedFrom: 1980, formedTo: 1989, status: "Active" }),
    ).toMatchObject({
      total: 1,
    });
  });

  it("sorts by reviews, rating (enough reviews only) and age", () => {
    expect(run({ intent: "bands", sort: "reviews" })).toMatchObject({ rows: [1, 0, 3, 2, 4] });
    expect(run({ intent: "bands", sort: "rating" })).toMatchObject({ rows: [3, 0, 1] });
    expect(run({ intent: "bands", sort: "oldest", limit: 2 })).toMatchObject({ rows: [1, 2] });
  });

  it("ranks groups", () => {
    expect(run({ intent: "top", groupBy: "country" })).toEqual({
      kind: "top",
      total: 5,
      groups: [
        { key: "Spain", count: 3 },
        { key: "Norway", count: 1 },
        { key: "United States", count: 1 },
      ],
    });
    expect(run({ intent: "top", groupBy: "decade", genre: ["thrash"] })).toMatchObject({
      groups: [{ key: "1980s", count: 2 }],
    }); // without a year: no decade
  });

  it("answers lineups by role, and members' bands", () => {
    expect(roleNeedle("batería")).toBe("drum");
    expect(run({ intent: "lineup", band: "Slayer", role: "guitars" })).toEqual({
      kind: "lineup",
      lineups: [
        { row: 1, header: "Last known", members: [["Kerry King", "Guitars"]], all: oracleFile().lineups["1"]![1] },
      ],
      bandsWithoutData: 1, // the Spanish Slayer
    });
    expect(run({ intent: "bands", member: "fenriz" })).toMatchObject({ rows: [0] });
  });

  it("answers discographies and album titles", () => {
    expect(run({ intent: "albums", band: "Slayer", albumType: "Full-length", sort: "newest", limit: 1 })).toMatchObject(
      {
        albums: [{ row: 1, album: [3, "Reign in Blood", "Full-length", 1986] }],
      },
    );
    expect(run({ intent: "albums", album: "reign in blood" })).toMatchObject({ total: 1, bandsWithoutData: 4 });
  });

  it("searches an unknown country as a place", () => {
    const result = engine.run({ intent: "bands", country: "Andalusia" });
    expect(result.answer).toMatchObject({ rows: [3] });
    expect(result.notes).toEqual([{ kind: "countryAsLocation", value: "Andalusia" }]);
  });
});

/** A vocabulary like the real one, for a few names. */
const vocab: Vocabulary = {
  isBand: (n) => ["judas priest", "iron maiden", "ghost", "opeth", "bathory", "master", "death", "slayer"].includes(n),
  isLabel: (n) => n === "nuclear blast",
  country: (n) =>
    ({
      spain: "Spain",
      espana: "Spain",
      japan: "Japan",
      japon: "Japan",
      "estados unidos": "United States",
      grecia: "Greece",
      alemania: "Germany",
    })[n] ?? null,
};
const rules = (question: string, model: Query = { intent: "bands" }): Query => refine(question, model, vocab);

describe("refine: the question's own cues", () => {
  it("reads years, decades and ranges", () => {
    expect(yearsIn("formadas en los 80")).toEqual({ from: 1980, to: 1989 });
    expect(yearsIn("formed in the 2000s")).toEqual({ from: 2000, to: 2009 });
    expect(yearsIn("despues de 2010")).toEqual({ from: 2011 });
    expect(yearsIn("antes de 1990")).toEqual({ to: 1989 });
    expect(yearsIn("entre 1985 y 1990")).toEqual({ from: 1985, to: 1990 });
    expect(yearsIn("las 20 bandas mas antiguas")).toBeNull();
  });

  it("finds countries by name or nationality", () => {
    expect(countriesIn("bandas finlandesas de japon", vocab)).toEqual(["Japan", "Finland"]);
    expect(countriesIn("tell us about it", vocab)).toEqual([]);
  });

  it("translates common themes", () => {
    expect(themeWord("satánica")).toBe("satan");
    expect(themeWord("guerra")).toBe("war");
    expect(themeWord("Lovecraft")).toBe("lovecraft");
  });

  it("reads lists, counts and rankings", () => {
    expect(rules("Bandas de thrash de Murcia formadas en los 80 que sigan activas")).toEqual({
      intent: "bands",
      location: "Murcia",
      genre: ["thrash"],
      formedFrom: 1980,
      formedTo: 1989,
      status: "Active",
    });
    expect(rules("¿Cuántas bandas de metal hay en España?")).toEqual({ intent: "count", country: "Spain" });
    expect(rules("¿Qué ciudades de Estados Unidos tienen más bandas de death metal?")).toEqual({
      intent: "top",
      groupBy: "location",
      country: "United States",
      genre: ["death"],
    });
    expect(rules("Las 20 bandas más antiguas de Japón")).toEqual({
      intent: "bands",
      country: "Japan",
      sort: "oldest",
      limit: 20,
    });
  });

  it("reads lineups, members and albums", () => {
    expect(rules("¿Quién toca el bajo en Judas Priest?")).toEqual({
      intent: "lineup",
      band: "Judas Priest",
      role: "bass",
    });
    expect(rules("who's the bassist of Judas Priest")).toEqual({
      intent: "lineup",
      band: "Judas Priest",
      role: "bass",
    });
    expect(rules("el guitarrista de Slayer")).toEqual({ intent: "lineup", band: "Slayer", role: "guitars" });
    expect(rules("¿En qué grupos está Dave Lombardo?")).toEqual({ intent: "bands", member: "Dave Lombardo" });
    expect(rules("Último disco de Opeth")).toEqual({
      intent: "albums",
      band: "Opeth",
      sort: "newest",
      limit: 1,
      albumType: "Full-length",
    });
    expect(rules("¿De quién es el disco Master of Puppets?")).toEqual({ intent: "albums", album: "Master of Puppets" });
    expect(rules("Discos de Iron Maiden de los 80")).toMatchObject({
      band: "Iron Maiden",
      releasedFrom: 1980,
      releasedTo: 1989,
    });
  });

  it("knows what the data can't answer", () => {
    expect(rules("¿Cuál fue el tercer guitarrista de Manowar?").missing).toBe("past_members");
    expect(rules("¿Qué grupo dice más veces 'apple' en sus letras?").missing).toBe("lyrics");
    expect(rules("Bandas parecidas a Emperor").missing).toBe("similar");
    expect(rules("¿Qué canción de Slayer es la más larga?").missing).toBe("tracks");
    expect(rules("Bandas cuyas letras traten sobre Lovecraft")).toEqual({ intent: "bands", themes: ["lovecraft"] });
    expect(rules("Bandas que hablen de Tolkien")).toEqual({ intent: "bands", themes: ["tolkien"] });
  });
});

describe("refine: what the model adds", () => {
  it("drops filters the question doesn't back", () => {
    const invented: Query = { intent: "bands", location: "Murcia", themes: ["war", "violence"] };
    expect(rules("Bandas de thrash de Murcia", invented)).toEqual({
      intent: "bands",
      location: "Murcia",
      genre: ["thrash"],
    });
    const model: Query = {
      intent: "top",
      groupBy: "year",
      country: "Brazil",
      genre: ["black"],
      missing: "lyrics",
      limit: 1,
    };
    expect(rules("Las 5 bandas mejor valoradas de Grecia", model)).toEqual({
      intent: "bands",
      country: "Greece",
      sort: "rating",
      limit: 5,
    });
  });

  it("keeps the model's translations of places and themes", () => {
    expect(rules("Grupos de sludge de Nueva Orleans", { intent: "bands", location: "New Orleans" })).toMatchObject({
      location: "New Orleans",
    });
    expect(rules("Bandas que cantan sobre la guerra", { intent: "bands", themes: ["war"] })).toEqual({
      intent: "bands",
      themes: ["war"],
    });
    expect(rules("Bandas de Sevilla", { intent: "bands", location: "Sevilla" })).toMatchObject({ location: "Seville" });
  });

  it("finds labels and keeps the model's 'can't answer' when nothing else is found", () => {
    expect(rules("Bandas de Nuclear Blast de Alemania", { intent: "bands", genre: ["nuclear", "blast"] })).toEqual({
      intent: "bands",
      label: "Nuclear Blast",
      country: "Germany",
    });
    expect(rules("¿Cuál es el sentido de la vida?", { intent: "unsupported", missing: "other" })).toEqual({
      intent: "unsupported",
      missing: "other",
    });
  });
});

describe("describeQuery", () => {
  it("lists what was understood in the viewer's language", () => {
    const t = translator("es", String);
    const chips = describeQuery(
      {
        intent: "top",
        groupBy: "label",
        genre: ["death"],
        country: "Sweden",
        status: "Active",
        formedFrom: 1990,
        formedTo: 1999,
        limit: 5,
      },
      t,
      (c) => (c === "Sweden" ? "Suecia" : c),
    );
    expect(chips).toEqual([
      "ranking",
      "por sello",
      "género: death",
      "país: Suecia",
      "Activa",
      "formadas 1990–1999",
      "top 5",
    ]);
  });
});
