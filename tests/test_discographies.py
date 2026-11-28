from metal_atlas import discographies


def test_refresh_changed_then_never_downloaded_then_stale_upcoming(monkeypatch):
    now = 100 * 86400.0
    month_ago = now - 31 * 86400
    store = {1: (month_ago, []), 2: (month_ago, []), 3: (now - 86400, [])}  # 4 never downloaded
    seen = {}
    monkeypatch.setattr(discographies, "load", lambda: store)
    monkeypatch.setattr(discographies, "upcoming_band_ids", lambda: {2, 3, 99})
    monkeypatch.setattr(discographies, "compact", lambda store, known: None)

    def download(ids, *, deadline=None, **_):
        seen["ids"], seen["deadline"] = list(ids), deadline
        return 0

    monkeypatch.setattr(discographies, "download", download)
    monkeypatch.setattr(discographies.time, "time", lambda: now)
    discographies.refresh([1, 77], {1, 2, 3, 4}, hours=0.5)
    # changed (known only), never downloaded, then upcoming not checked for a month (3 was checked yesterday);
    # no rotation over the other bands
    assert seen["ids"] == [1, 4, 2]
    assert seen["deadline"] == now + 1800
