from metal_atlas.regions import (
    CountryRegions,
    Gazetteer,
    Unit,
    band_region_map,
    name_key,
    oriented,
    point_in_ring,
    region_for,
)

SQUARE = [(0, 0), (0, 10), (10, 10), (10, 0), (0, 0)]


def square(x0, y0, size=10):
    return [(x0, y0), (x0, y0 + size), (x0 + size, y0 + size), (x0 + size, y0), (x0, y0)]


def test_name_key_drops_generic_words_accents_and_spaces():
    assert name_key("Province of Västra Götaland") == "vastragotaland"
    assert name_key("State of São Paulo") == "saopaulo"


def test_point_in_ring():
    assert point_in_ring(5, 5, SQUARE)
    assert not point_in_ring(15, 5, SQUARE)


def test_oriented_rings():
    exterior = oriented(SQUARE, exterior=True)
    hole = oriented(SQUARE, exterior=False)
    assert exterior == hole[::-1]
    assert exterior[1] == [0.0, 0.1]  # degrees: coordinates are stored ×100


def make_country() -> CountryRegions:
    """Two regions side by side: West (x 0..10) and East (x 10..20), in 0.01° units."""
    cr = CountryRegions(regions=["West", "East"], iso="XX")
    cr.names["west"].add(0)
    cr.names["east"].add(1)
    cr.units = [Unit(0, [[square(0, 0)]], (0, 0, 10, 10)), Unit(1, [[square(10, 0)]], (10, 0, 20, 10))]
    return cr


def test_locate_inside_and_off_the_polygons():
    cr = make_country()
    assert cr.locate(0.05, 0.05) == 0
    assert cr.locate(0.15, 0.05) == 1
    assert cr.locate(0.30, 0.05) == 1  # off every polygon: the closest region


def gazetteer(tmp_path) -> Gazetteer:
    cities = tmp_path / "cities.txt"
    row = ["0", "Eastville", "Eastville", "", "0.05", "0.15", "P", "PPL", "XX", "", "02", "", "", "", "5000"]
    cities.write_text("\t".join(row + [""] * 4) + "\n", encoding="utf-8")
    admin1 = tmp_path / "admin1.txt"
    admin1.write_text("XX.02\tEast\tEast\t1\n", encoding="utf-8")
    return Gazetteer(cities, admin1, {"XX"})


def test_region_for_by_region_name_then_city(tmp_path):
    cr, gz = make_country(), gazetteer(tmp_path)
    assert region_for(cr, gz, ["Somewhere", "West"]) == 0
    assert region_for(cr, gz, ["Eastville"]) == 1
    assert region_for(cr, gz, ["Nowhere"]) is None


def test_band_region_map(tmp_path):
    regions = {"Xland": make_country()}
    bands = [
        {"id": 1, "country": "Xland", "location": "Eastville (early); West, Xland (later)"},
        {"id": 2, "country": "Xland", "location": "N/A"},
        {"id": 3, "country": "International", "location": "Eastville, Xland"},
    ]
    placed, stats = band_region_map(bands, regions, gazetteer(tmp_path), {"Xland"})
    assert placed == {1: {"Xland": [1, 0]}, 3: {"Xland": [1]}}
    assert stats["Xland"] == [1, 1]  # [placed, with a usable location]: band 2 has none
