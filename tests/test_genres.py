import pytest

from metal_atlas.genres import split_genres


@pytest.mark.parametrize(
    ("genre", "expected"),
    [
        ("Heavy Metal", ["Heavy Metal"]),
        ("Black/Death Metal", ["Black Metal", "Death Metal"]),
        (
            "Crust Punk (early); Progressive Sludge/Groove Metal (later)",
            ["Crust Punk", "Progressive Sludge Metal", "Groove Metal"],
        ),
        ("Heavy Metal with Doom influences", ["Heavy Metal"]),
        ("Thrash Metal, Hardcore", ["Thrash Metal", "Hardcore"]),
        ("Death Metal; Death Metal (later)", ["Death Metal"]),
        ("", []),
        (None, []),
    ],
)
def test_split_genres(genre, expected):
    assert split_genres(genre) == expected
