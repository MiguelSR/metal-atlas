from metal_atlas.countries import band_countries, canonical_country, location_segments, without_eras

KNOWN = {"Brazil", "Korea, South", "Sweden", "United States", "Netherlands"}


def test_aliases():
    assert canonical_country("USA") == "United States"
    assert canonical_country("South Korea") == "Korea, South"
    assert canonical_country("Sweden") == "Sweden"


def test_location_segments_split_eras_and_places():
    assert location_segments("Stockholm (early); Miami, Florida, United States (later)") == [
        ["Stockholm"],
        ["Miami", "Florida", "United States"],
    ]
    assert location_segments(None) == []
    assert without_eras("Oslo (early)").strip() == "Oslo"


def test_band_in_one_country_keeps_it():
    assert band_countries("Sweden", "Gothenburg", KNOWN) == ["Sweden"]


def test_international_band_counts_in_the_countries_of_its_location():
    location = "Divinópolis, Minas Gerais, Brazil / Seoul, South Korea / Amsterdam, Holland"
    assert band_countries("International", location, KNOWN) == ["Brazil", "Korea, South", "Netherlands"]


def test_international_band_without_known_country_stays_international():
    assert band_countries("International", "Somewhere", KNOWN) == ["International"]
