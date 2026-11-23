import pytest

from metal_atlas.build import Band, Relevance, counts


def record(band_id, name="Band", label=None, notes=None, truncated=False, year=1990, status="Active", genre="X"):
    url = f"https://www.metal-archives.com/bands/{name.replace(' ', '_')}/{band_id}"
    return {
        "id": band_id,
        "name": name,
        "url": url,
        "label": label,
        "notes": notes,
        "notes_truncated": truncated,
        "formed_in": year,
        "status": status,
        "genre": genre,
    }


def test_relevance_weights_reviews_age_label_and_notes():
    bands = [record(1, label="Big"), record(2, label="Big"), record(3, notes="short"), record(4, truncated=True)]
    score = Relevance(bands, {1: [10, 900], 3: [1, 50]})
    assert score(bands[0]) > score(bands[2]) > score(bands[3])  # more reviews and an earlier id win
    assert score(bands[0]) == pytest.approx(0.55 + 0.3 + 0.1)  # most reviews, oldest, biggest label


def test_counts_by_year_and_genre():
    bands = [
        Band(record(1, year=1990), genres=["Thrash Metal"]),
        Band(record(2, year=1990, status="Split-up"), genres=["Thrash Metal", "Death Metal"]),
        Band(record(3, year=None), genres=["Death Metal"]),
    ]
    assert counts(bands, {"Thrash Metal": 0, "Death Metal": 1}) == {
        "y": {"0": [1, 1], "1990": [2, 1]},
        "g": {"0": {"1990": 2}, "1": {"0": 1, "1990": 1}},
    }


def test_slug_only_when_it_differs_from_the_name():
    assert Band(record(1, name="Iron Maiden")).slug is None
    odd = record(2, name="AC/DC")
    odd["url"] = "https://www.metal-archives.com/bands/AC%2FDC/2"
    assert Band(odd).slug is None
    odd["url"] = "https://www.metal-archives.com/bands/ACDC/2"
    assert Band(odd).slug == "ACDC"
