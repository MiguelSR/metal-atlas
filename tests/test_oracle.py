import json

from metal_atlas.build import Band
from metal_atlas.oracle import Dictionary, oracle_data, write_album_blocks
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
    members = tmp_path / "m"
    write_cached(members, 2, {"h": "Current", "m": [["Ana", "Drums"]]})
    albums = {2: [[7, "Demo I", "Demo", 1986]]}
    bands = [band(1, "Uno", 0.1, label="Big"), band(2, "Dos", 0.9, location=None, year=None)]
    data = oracle_data(bands, {2: [4, 300]}, members, albums.get)
    assert data["name"] == ["Dos", "Uno"]
    assert data["year"] == [0, 1985]
    assert data["location"] == [-1, 0] and data["dicts"]["location"] == ["Murcia"]
    assert data["label"] == [-1, 0] and data["dicts"]["label"] == ["Big"]
    assert data["reviews"] == [4, 0] and data["rating"] == [75, 0]
    assert data["lineups"] == {0: ["Current", [["Ana", "Drums"]]]}
    assert data["albums"] == [[[7, "Demo I", "Demo", 1986]], 0]  # one item per row; 0 = not known
    assert data["status"] == [1, 1] and data["countries"] == ["Spain"] and data["country"] == [[0], [0]]


def test_album_blocks_cover_every_row_and_replace_old_ones(tmp_path):
    folder = tmp_path / "albums"
    folder.mkdir()
    (folder / "9.json").write_text("{}")
    assert write_album_blocks([0, [[1, "A", "Demo", 1990]], 0, 0, [[2, "B", "EP", 2001]]], folder, block=2) == 3
    blocks = [json.loads((folder / f"{k}.json").read_text()) for k in range(3)]
    assert [b["from"] for b in blocks] == [0, 2, 4]
    assert sum((b["a"] for b in blocks), []) == [0, [[1, "A", "Demo", 1990]], 0, 0, [[2, "B", "EP", 2001]]]
    assert not (folder / "9.json").exists()
