import datetime as dt

from metal_atlas.update import FIRST_SINCE, OVERLAP, DatasetUpdater, changed_after, months, start_date


def test_months_spans_year_boundaries():
    assert list(months(dt.datetime(2026, 11, 20), dt.datetime(2027, 2, 1))) == [
        (2026, 11),
        (2026, 12),
        (2027, 1),
        (2027, 2),
    ]


def test_start_date_goes_back_one_day_from_the_last_update():
    assert start_date({"since": "2026-11-23 05:52"}, None) == dt.datetime(2026, 11, 22, 5, 52)
    assert start_date(None, None) == FIRST_SINCE - OVERLAP
    assert start_date({"since": "2026-11-23 05:52"}, "2026-01-01") == dt.datetime(2026, 1, 1)


def test_dataset_records_keep_the_dataset_fields_in_order():
    updater = DatasetUpdater([{"id": 2, "name": "B", "extra": 1}, {"id": 1, "name": "A"}])
    records = updater.records()
    assert [r["id"] for r in records] == [1, 2]
    assert list(records[0])[:3] == ["id", "name", "aka"]
    assert "extra" not in records[1]


def test_changed_after_skips_bands_already_downloaded_in_the_overlap():
    last = dt.datetime(2026, 11, 27, 10, 0)
    changes = {1: dt.datetime(2026, 11, 26, 23, 0), 2: last, 3: dt.datetime(2026, 11, 27, 12, 30)}
    assert changed_after(changes, last) == {2, 3}
    assert changed_after(changes, None) == {1, 2, 3}
