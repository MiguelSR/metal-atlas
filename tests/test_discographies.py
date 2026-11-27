from metal_atlas import discographies


def test_refresh_order_and_time_limit(monkeypatch):
    store = {1: (300, []), 2: (100, []), 3: (200, [])}  # 4 never downloaded
    seen = {}
    monkeypatch.setattr(discographies, "load", lambda: store)
    monkeypatch.setattr(discographies, "upcoming_band_ids", lambda: {3, 99})
    monkeypatch.setattr(discographies, "compact", lambda store, known: None)

    def download(ids, *, deadline=None, **_):
        seen["ids"], seen["deadline"] = list(ids), deadline
        return 0

    monkeypatch.setattr(discographies, "download", download)
    monkeypatch.setattr(discographies.time, "time", lambda: 1000.0)
    discographies.refresh([1, 77], {1, 2, 3, 4}, rotation=2, hours=0.5)
    # changed (known only), upcoming (known only), then the least recently checked: never downloaded first
    assert seen["ids"] == [1, 3, 4, 2]
    assert seen["deadline"] == 1000.0 + 1800
