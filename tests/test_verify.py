from metal_atlas.verify import genre_rank, match_artist, title_key

DISCOGRAPHY = [
    [1, "In Memory", "EP", 1996],
    [2, "Dreaming Neon Black", "Full-length", 1999],
    [3, "Dead Heart in a Dead World", "Full-length", 2000],
    [4, "Nevermore", "Full-length", 1995],
]


def song(artist, album, track, year=2000, collection=None):
    return {
        "wrapperType": "track",
        "artistId": artist,
        "collectionName": album,
        "collectionId": collection or hash(album) % 10_000,
        "trackName": track,
        "releaseDate": f"{year}-01-01T00:00:00Z",
        "previewUrl": f"https://audio/{artist}/{track}.m4a",
        "artworkUrl100": "https://art/100x100bb.jpg",
    }


def test_title_key_ignores_editions_and_formats():
    assert title_key("Dreaming Neon Black (Remastered 2004)") == "dreamingneonblack"
    assert title_key("In Memory - EP") == "inmemory"
    assert title_key("Dead Heart in a Dead World [Bonus Track Version]") == "deadheartinadeadworld"


def test_genre_rank_prefers_metal():
    assert [genre_rank({"primaryGenreName": g}) for g in ("Heavy Metal", "Hard Rock", "Pop")] == [0, 1, 2]


def test_the_artist_whose_albums_match_wins_over_a_namesake():
    artists = [{"artistId": 1}, {"artistId": 2}]
    songs = [
        song(1, "Wish She Stayed", "Wish she stayed (feat. Nevermore)"),
        song(2, "Dreaming Neon Black (Remastered)", "The Death of Passion", 1999),
        song(2, "Dead Heart in a Dead World", "Narcosynthesis", 2000),
    ]
    match = match_artist("Nevermore", DISCOGRAPHY, artists, songs)
    assert match.artist_id == 2
    assert match.titles == ["deadheartinadeadworld", "dreamingneonblack"]
    assert [t[1] for t in match.tracks] == ["The Death of Passion", "Narcosynthesis"]


def test_only_songs_from_matching_albums_are_kept():
    """An iTunes artist page that mixes two namesake bands only plays the right band's albums."""
    songs = [song(2, "In Memory", "Matricide", 1996), song(2, "Some Other Band's Album", "Not Them")]
    match = match_artist("Nevermore", DISCOGRAPHY, [{"artistId": 2}], songs)
    assert [t[1] for t in match.tracks] == ["Matricide"]


def test_a_self_titled_album_needs_the_year_to_match():
    artists = [{"artistId": 3}]
    assert match_artist("Nevermore", DISCOGRAPHY, artists, [song(3, "Nevermore", "X", 2019)]).artist_id is None
    assert match_artist("Nevermore", DISCOGRAPHY, artists, [song(3, "Nevermore", "X", 1996)]).artist_id == 3


def test_no_match_is_cached_as_empty():
    match = match_artist("Nevermore", DISCOGRAPHY, [], [])
    assert match.as_cache() == {"a": None, "c": [], "n": [], "t": [], "v": 3}
