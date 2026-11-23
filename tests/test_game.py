from metal_atlas.game import album_titles, pick_tracks, shared_name_bands, shorten_track

AUDIO = "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview1/v4/a/b.m4a"
COVER = "https://is3-ssl.mzstatic.com/image/thumb/Music1/v4/c/cover.jpg/100x100bb.jpg"


def test_shorten_track_strips_common_url_parts():
    assert shorten_track([AUDIO, "Song", "Album", COVER]) == [
        "AudioPreview1/v4/a/b.m4a",
        "Song",
        "Album",
        "3|Music1/v4/c/cover.jpg",
    ]


def test_shorten_track_keeps_unknown_urls():
    assert shorten_track(["https://other/x.m4a", "S", "A", None]) == ["https://other/x.m4a", "S", "A", None]


def test_pick_tracks_rotates_albums():
    tracks = [[f"u{i}", f"s{i}", album, None] for i, album in enumerate("AAABBC")]
    assert [t[1] for t in pick_tracks(tracks, 4)] == ["s0", "s3", "s5", "s1"]
    assert len(pick_tracks(tracks, 10)) == 6


def test_album_titles_prefers_full_lengths_and_eps():
    disco = [[1, "Demo", "Demo", 1990], [2, "Album", "Full-length", 1991], [3, "Live", "Live album", 1992]]
    assert album_titles(disco) == ["Album"]
    assert album_titles([[1, "Demo", "Demo", 1990], [3, "Live", "Live album", 1992]]) == ["Live"]
    assert album_titles(None) == []


def test_shared_name_bands():
    ids, names = [1, 2, 3, 4], ["Nevermore", "NEVERMORE", "Hydra", "Nevermöre"]
    assert shared_name_bands(ids, names, exclude={1}) == [2, 4]
