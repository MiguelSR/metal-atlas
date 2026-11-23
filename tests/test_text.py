from metal_atlas.text import field_text, fold, split_list, strip_html


def test_fold_removes_accents_and_case():
    assert fold("Motörhead") == "motorhead"
    assert fold("Ñu") == "nu"


def test_strip_html_keeps_line_breaks_and_decodes_entities():
    assert strip_html("<b>Rock</b> &amp; Roll<br />Live") == "Rock & Roll\nLive"
    assert strip_html(None) == ""


def test_field_text_turns_empty_values_into_none():
    assert field_text(" N/A ") is None
    assert field_text("") is None
    assert field_text("<a href='x'>Sweden</a>") == "Sweden"


def test_split_list():
    assert split_list("Rising Force, Yngwie J. Malmsteen; ") == ["Rising Force", "Yngwie J. Malmsteen"]
