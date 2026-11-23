from metal_atlas.members import review_passage
from tests import fixtures


def test_review_passage_avoids_band_and_album_names():
    passage = review_passage(fixtures.REVIEW_PAGE, "Iron Maiden", "Powerslave")
    assert passage.startswith("The guitars gallop")
    assert 140 <= len(passage) <= 320
    assert "Maiden" not in passage and "Powerslave" not in passage


def test_review_passage_none_when_every_sentence_names_the_band():
    page = '<div class="reviewContent">' + "Iron Maiden rules and Iron Maiden rocks forever and ever. " * 5 + "</div>"
    assert review_passage(page, "Iron Maiden", "") is None


def test_review_passage_needs_a_review():
    assert review_passage("<html></html>", "Iron Maiden", "") is None
