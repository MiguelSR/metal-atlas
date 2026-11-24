from metal_atlas.build import Band
from metal_atlas.oracle import Dictionary, oracle_data
from metal_atlas.jsonio import write_cached


def band(band_id, name, score, genre="Thrash Metal", location="Murcia", label="000INDIE000", year=1985):
    raw = {
        "id": band_id,
        "name": name,
        "url": f"https://www.metal-archives.com/bands/{name}/{band_id}",
        "genre": genre,
        "location": location,
        "status": "Active",
        "formed_in": year,
        "themes": "War",
        "label": label,
    }
    return Band(raw, countries=["Spain"], genres=["Thrash Metal"], score=score)


def test_dictionary_numbers_values_and_skips_empty():
    d = Dictionary()
    assert [d("a"), d("b"), d("a"), d(None), d("")] == [0, 1, 0, -1, -1]
    assert d.values == ["a", "b"]


def test_oracle_data_is_columnar_by_relevance_with_game_extras(tmp_path):
    members, disco = tmp_path / "m", tmp_path / "d"
    write_cached(members, 2, {"h": "Current", "m": [["Ana", "Drums"]]})
    write_cached(disco, 2, [[7, "Demo I", "Demo", 1986]])
    bands = [band(1, "Uno", 0.1, label="Big"), band(2, "Dos", 0.9, location=None, year=None)]
    data = oracle_data(bands, {2: [4, 300]}, members, disco)
    assert data["name"] == ["Dos", "Uno"]
    assert data["year"] == [0, 1985]
    assert data["location"] == [-1, 0] and data["dicts"]["location"] == ["Murcia"]
    assert data["label"] == [-1, 0] and data["dicts"]["label"] == ["Big"]
    assert data["reviews"] == [4, 0] and data["rating"] == [75, 0]
    assert data["lineups"] == {0: ["Current", [["Ana", "Drums"]]]}
    assert data["albums"] == {0: [[7, "Demo I", "Demo", 1986]]}
    assert data["status"] == [1, 1] and data["countries"] == ["Spain"] and data["country"] == [[0], [0]]
