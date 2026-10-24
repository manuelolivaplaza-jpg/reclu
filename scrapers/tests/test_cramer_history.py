from datetime import date

import pytest

import cramer_history as ch

PAGE = (
    '{"url":"https:\\u002F\\u002Fwww.cnbc.com\\u002F2025\\u002F10\\u002F07\\u002F'
    'cramers-lightning-round-affirm-is-a-buy.html"},'
    '{"url":"https:\\u002F\\u002Fwww.cnbc.com\\u002F2025\\u002F10\\u002F07\\u002Fother.html"}'
)


class R:
    def __init__(self, code, text=""):
        self.status_code, self.text = code, text


def test_sitemap_url():
    assert ch.sitemap_url(date(2025, 10, 1)) == "https://www.cnbc.com/site-map/articles/2025/October/1/"


def test_extract_unescapes():
    assert ch.extract_lightning_urls(PAGE) == [
        "https://www.cnbc.com/2025/10/07/cramers-lightning-round-affirm-is-a-buy.html"
    ]


def test_iter_days_limits():
    assert len(ch.iter_days(date(2025, 10, 1), date(2025, 10, 3))) == 3
    with pytest.raises(ValueError):
        ch.iter_days(date(2025, 10, 3), date(2025, 10, 1))
    with pytest.raises(ValueError):
        ch.iter_days(date(2020, 1, 1), date(2025, 1, 1))


def test_collect_marks_hypothesis_and_skips_errors():
    pages = iter([R(200, PAGE), R(404), R(200, PAGE)])
    out = ch.collect(date(2025, 10, 7), date(2025, 10, 9), get=lambda u: next(pages), sleep=lambda s: None)
    assert len(out) == 1
    assert out[0]["status"] == "pendiente" and out[0]["hipotesis"] is True
    assert out[0]["ticker"] is None
