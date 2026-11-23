import datetime as dt

from metal_atlas import metal_archives as ma
from tests import fixtures


def test_parse_band_page():
    band = ma.parse_band_page(fixtures.BAND_PAGE)
    assert band["name"] == "Yngwie Malmsteen"
    assert band["url"] == "https://www.metal-archives.com/bands/Yngwie_Malmsteen/84"
    assert band["country"] == "Sweden"
    assert band["location"] == "Stockholm (early); Miami, Florida, United States (later)"
    assert band["status"] == "Active"
    assert band["formed_in"] == 1978
    assert band["genre"] == "Neoclassical Power Metal/Shred"
    assert band["label"] == "Rising Force Records"
    assert band["notes"].startswith("Malmsteen's demos brought him to the attention of Shrapnel Records.")
    assert "Read more" not in band["notes"]
    assert band["notes_truncated"] is True


def test_parse_band_page_with_empty_values():
    band = ma.parse_band_page(fixtures.NEW_BAND_PAGE)
    assert band["location"] is None
    assert band["formed_in"] is None
    assert band["themes"] is None
    assert band["label"] == ma.NO_LABEL
    assert band["notes"] is None
    assert band["notes_truncated"] is False


def test_parse_band_page_that_is_not_a_band():
    assert ma.parse_band_page("<html>maintenance</html>") is None


def test_parse_lineup_takes_the_current_lineup():
    lineup = ma.parse_lineup(fixtures.BAND_PAGE)
    assert lineup["h"] == "Current"
    assert lineup["m"] == [["Yngwie J. Malmsteen", "Guitars, Vocals"], ["Nick Marino", "Keyboards"]]
    assert lineup["p"].endswith("84_photo.jpg?1")
    assert lineup["lg"].endswith("84_logo.png?2")


def test_parse_lineup_without_members():
    assert ma.parse_lineup("<html></html>") == {"h": None, "m": [], "p": None, "lg": None}


def test_parse_discography():
    assert ma.parse_discography(fixtures.DISCOGRAPHY_PAGE) == [
        [280100, "Powerhouse", "Demo", 1978],
        [313, "Rising Force", "Full-length", 1984],
        [999, "Trilogy & Co", "EP", 1986],
    ]


def test_review_key_is_album_and_user():
    assert ma.review_key(fixtures.REVIEW_ROW[1]) == (745, 950635)
    assert ma.review_key("<a href='nothing'>") is None


def test_parse_review_row():
    review = ma.parse_review_row(fixtures.REVIEW_ROW)
    assert (review.key, review.band_id, review.rating) == ((745, 950635), 182, 100)


def test_change_time_uses_the_year_being_read():
    assert ma.change_time(fixtures.CHANGE_ROW[4], 2026) == dt.datetime(2026, 11, 22, 2, 48)
    assert ma.change_time("no date", 2026) is None


def test_band_id_in():
    assert ma.band_id_in(fixtures.CHANGE_ROW[1]) == 84
    assert ma.band_id_in("") is None


def test_parse_search_name():
    cell = ma.parse_search_name(fixtures.SEARCH_NAME_CELL)
    assert (cell.band_id, cell.name) == (84, "Yngwie Malmsteen")
    assert cell.aka_list == ["Yngwie J. Malmsteen's Rising Force", "Rising Force"]


def test_parse_aka_matches_the_band_id():
    rows = [[fixtures.SEARCH_NAME_CELL, "Neoclassical", "Sweden", "1978"]]
    assert ma.parse_aka(rows, 84) == (
        "Yngwie J. Malmsteen's Rising Force, Rising Force",
        ["Yngwie J. Malmsteen's Rising Force", "Rising Force"],
    )
    assert ma.parse_aka(rows, 999) == (None, None)


def test_urls():
    assert ma.band_url(84) == "https://www.metal-archives.com/bands/_/84"
    assert "selection/2026-01/by/modified" in ma.changes_url("modified", 2026, 1, 0)
    assert "bandName=Iron+Maiden&exactBandMatch=1" in ma.exact_name_search_url("Iron Maiden")
