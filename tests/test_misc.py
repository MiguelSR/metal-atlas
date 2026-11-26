"""Smaller modules: data, bundle, jsonio, net, the command line."""

import pytest

from metal_atlas import __main__ as cli
from metal_atlas import net
from metal_atlas.bundle import MissingAppScript, bundle, versioned_script, wrap_document
from metal_atlas.data import public_records
from metal_atlas.jsonio import read_json, write_json


def test_public_records_drop_notes_text_and_emails():
    bands = [{"id": 1, "notes": "Contact: a@b.com", "contact_emails": ["a@b.com"]}, {"id": 2, "notes": None}]
    assert public_records(bands) == [
        {"id": 1, "notes": "…", "contact_emails": None},
        {"id": 2, "notes": None, "contact_emails": None},
    ]


def test_wrap_document():
    doc = wrap_document('<style>x</style><div class="app">hi</div>')
    assert doc.startswith("<!doctype html>")
    assert '<style>x</style></head>\n<body>\n<div class="app">hi</div>' in doc


def test_bundle_copies_data_and_wraps_the_page(tmp_path):
    site, public = tmp_path / "site", tmp_path / "public"
    (site / "c").mkdir(parents=True)
    (site / "c" / "0.json").write_text("[]")
    (site / "index.html").write_text('<div class="app"></div>')
    with pytest.raises(MissingAppScript):
        bundle(site, public)
    (site / "app.js").write_text("")
    assert bundle(site, public) == 3
    assert (public / "index.html").read_text().startswith("<!doctype html>")


def test_app_script_is_versioned_by_its_content():
    page = '<script type="module" src="app.js"></script>'
    one, two = versioned_script(page, b"a"), versioned_script(page, b"b")
    assert one.startswith('<script type="module" src="app.js?v=') and one != two
    assert versioned_script(page, b"a") == one


def test_json_roundtrip(tmp_path):
    path = tmp_path / "a" / "b.json"
    write_json(path, {"k": "ü"}, compact=True)
    assert path.read_text(encoding="utf-8") == '{"k":"ü"}'
    assert read_json(path) == {"k": "ü"}
    assert read_json(tmp_path / "missing.json", default=[]) == []


@pytest.fixture
def no_sleep(monkeypatch):
    monkeypatch.setattr(net.time, "sleep", lambda s: None)


def test_fetch_retries_then_succeeds(monkeypatch, no_sleep):
    answers = iter([(503, ""), (200, "ok")])
    monkeypatch.setattr(net, "_curl", lambda url, **kw: next(answers))
    assert net.fetch("https://x") == "ok"


def test_fetch_returns_none_on_404(monkeypatch, no_sleep):
    monkeypatch.setattr(net, "_curl", lambda url, **kw: (404, ""))
    assert net.fetch("https://x") is None


def test_fetch_gives_up(monkeypatch, no_sleep):
    monkeypatch.setattr(net, "_curl", lambda url, **kw: (403, ""))
    with pytest.raises(net.FetchError):
        net.fetch("https://x", retries=2)


def test_fetch_json_accepts_control_characters(monkeypatch, no_sleep):
    monkeypatch.setattr(net, "_curl", lambda url, **kw: (200, '{"a": "line\nbreak"}'))
    assert net.fetch_json("https://x") == {"a": "line\nbreak"}


def test_cli_unknown_command_shows_usage():
    with pytest.raises(SystemExit) as exit_info:
        cli.main(["nope"])
    assert "usage: python3 -m metal_atlas" in str(exit_info.value)


def test_gh_retries_then_succeeds(monkeypatch):
    import subprocess

    from metal_atlas import data

    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        if len(calls) < 3:
            raise subprocess.CalledProcessError(1, cmd)
        return subprocess.CompletedProcess(cmd, 0)

    monkeypatch.setattr(data.subprocess, "run", fake_run)
    monkeypatch.setattr(data.time, "sleep", lambda s: None)
    data.gh("release", "upload", "x", attempts=4)
    assert len(calls) == 3


def test_gh_gives_up(monkeypatch):
    import subprocess

    import pytest

    from metal_atlas import data

    def fake_run(cmd, **kwargs):
        raise subprocess.CalledProcessError(1, cmd)

    monkeypatch.setattr(data.subprocess, "run", fake_run)
    monkeypatch.setattr(data.time, "sleep", lambda s: None)
    with pytest.raises(subprocess.CalledProcessError):
        data.gh("release", "upload", "x", attempts=2)
