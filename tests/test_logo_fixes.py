"""Logo lookups: what counts as a miss, one lookup per name within a time budget, name guesses, and the brand wash;
card pictures leaving with their account; uploads refused by size before the body is read. Made-up data only."""
from __future__ import annotations
import io
import os
import threading
import time
import urllib.error
import pytest
from app import api_files, api_logos, logos
from tests.test_cards import png

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 40


@pytest.mark.parametrize("name, want", [
    ("Amazon.com", ["amazon.com"]),
    ("AMAZON.COM*1A2B3C", ["amazon.com"]),
    ("www.target.com", ["target.com"]),
    ("APPLE.COM/BILL", ["apple.com"]),
    ("AMZN Mktp US*2K4", ["amazon.com"]),
    ("AMZN", ["amazon.com"]),
    ("WM SUPERCENTER #1234", ["walmart.com"]),
    ("Walmart", ["walmart.com"]),
    ("WHOLEFDS MKT 10234", ["wholefoodsmarket.com"]),
    ("Whole Foods", ["wholefoodsmarket.com"]),
    ("Costco Whse #0482", ["costco.com"]),
    ("UBER *TRIP HELP.UBER.COM", ["uber.com"]),
    ("Uber Eats", ["uber.com"]),
    ("The Home Depot", ["homedepot.com"]),
    ("Apple Cash", ["apple.com"]),
    ("Apple Com Bill", ["apple.com"]),
    ("Cash App to Jon", ["cash.app"]),
    ("H&M", ["hm.com"]),
    ("Spotify USA", ["spotify.com"]),
    ("Shell Oil 5544", ["shell.com"]),
    ("Tesla Supercharger", ["tesla.com"]),
    ("7-Eleven", ["7-eleven.com"]),
    ("Chipotle", ["chipotle.com"]),
    ("King Soopers", ["kingsoopers.com"]),
    ("US Bank", ["usbank.com"]),
    ("Mobile Deposit", []),
    ("Dining Out", []),
    ("Online Transfer to Savings", []),
    ("Autopay Pmt", []),
    ("Interest", []),
    ("Fee", []),
    ("Payment", []),
])
def test_name_guesses(name, want):
    assert logos.domains_for(name) == want


def _http(code):
    def urlopen(req, timeout):
        raise urllib.error.HTTPError(req.full_url, code, "x", {}, io.BytesIO())
    return urlopen


def test_only_a_real_answer_is_a_miss(monkeypatch):
    monkeypatch.setattr(logos.urllib.request, "urlopen", _http(404))
    assert logos._get("https://img.logo.dev/x.com") is None
    for code in (429, 500, 503):
        monkeypatch.setattr(logos.urllib.request, "urlopen", _http(code))
        with pytest.raises(logos.Transient):
            logos._get("https://img.logo.dev/x.com")

    def offline(req, timeout):
        raise urllib.error.URLError("no route")
    monkeypatch.setattr(logos.urllib.request, "urlopen", offline)
    with pytest.raises(logos.Transient):
        logos._get("https://img.logo.dev/x.com")


def test_a_failed_fetch_waits_minutes_not_a_month(monkeypatch):
    monkeypatch.setenv("LOGO_DEV_KEY", "pk_test")
    asked = []

    def down(url):
        asked.append(url)
        raise logos.Transient("503")
    monkeypatch.setattr(logos, "_get", down)
    assert logos.resolve("name", "acme", [("domain", "acme.com")]) is None
    assert not logos._path("name", "acme", "miss").exists()
    assert logos.resolve("name", "acme", [("domain", "acme.com")]) is None
    assert len(asked) == 1  # waiting, not hammering
    old = time.time() - logos.WAIT_SECONDS - 1
    os.utime(logos._path("name", "acme", "wait"), (old, old))
    monkeypatch.setattr(logos, "_get", lambda url: PNG)
    assert logos.resolve("name", "acme", [("domain", "acme.com")]) is not None


def test_no_key_is_not_remembered(monkeypatch):
    monkeypatch.setattr(logos, "_get", lambda url: PNG)
    assert logos.resolve("name", "acme", [("domain", "acme.com")]) is None
    assert logos.cached("name", "acme") == (None, False)
    monkeypatch.setenv("LOGO_DEV_KEY", "pk_test")
    assert logos.resolve("name", "acme", [("domain", "acme.com")]) is not None
    assert logos.resolve("name", "none", []) is None
    assert logos._path("name", "none", "miss").exists()  # no source at all is a real miss


def test_a_slow_lookup_stops_at_the_budget(monkeypatch):
    monkeypatch.setenv("LOGO_DEV_KEY", "pk_test")
    asked = []

    def slow(url):
        asked.append(url)
        time.sleep(min(0.15, logos._timeout()))
        raise logos.Transient("timeout")
    monkeypatch.setattr(logos, "_get", slow)
    t = time.monotonic()
    assert logos.resolve("name", "slow", [("domain", f"s{i}.com") for i in range(12)], budget=0.4) is None
    assert time.monotonic() - t < 1 and len(asked) <= 4


def test_one_lookup_per_name_at_a_time(monkeypatch):
    monkeypatch.setenv("LOGO_DEV_KEY", "pk_test")
    asked = []

    def get(url):
        asked.append(url)
        time.sleep(0.2)
        return PNG
    monkeypatch.setattr(logos, "_get", get)
    got = []
    threads = [threading.Thread(target=lambda: got.append(logos.resolve("name", "same", [("domain", "same.com")])))
               for _ in range(6)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    assert len(asked) == 1 and len(got) == 6 and all(got)


def test_concurrent_stores_of_one_logo(monkeypatch):
    errors = []

    def put():
        try:
            for _ in range(20):
                logos.store("name", "race", PNG)
        except Exception as e:  # noqa: BLE001
            errors.append(e)
    threads = [threading.Thread(target=put) for _ in range(6)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    assert not errors and not list(logos.folder().glob("*.tmp"))


def test_a_cached_logo_skips_the_bank_lookup(client, monkeypatch):
    monkeypatch.setenv("LOGO_DEV_KEY", "pk_test")
    monkeypatch.setattr(logos, "_get", lambda url: PNG if "costco.com" in url else None)
    assert client.get("/api/logo", params={"name": "Costco"}).status_code == 200

    def boom(con, name):
        raise AssertionError("looked at the bank again")
    monkeypatch.setattr(api_logos, "_bank_sources", boom)
    assert client.get("/api/logo", params={"name": "Costco"}).status_code == 200
    assert client.get("/api/logo/color", params={"name": "Costco"}).status_code == 200


def test_black_logos_make_no_wash(client, world, monkeypatch):
    monkeypatch.setenv("LOGO_DEV_KEY", "pk_test")
    black = png(12, 12, lambda x, y: (0, 0, 0, 255))
    monkeypatch.setattr(logos, "_get", lambda url: black)
    assert client.get("/api/logo/color", params={"name": "Inkwell"}).json() == {"color": None}
    aid = client.post("/api/accounts", json={"name": "Night Card", "kind": "card", "bank": "Inkwell"}).json()["id"]
    assert client.get("/api/logo/color", params={"account": aid}).json() == {"color": "#000000"}  # a black card
    assert logos.washes("#E61428") and logos.washes("#00A05A")
    assert not any(logos.washes(c) for c in ("#000000", "#111111", "#FFFFFF", "#F4F4F4", "#808080", None, "red"))


def test_a_deleted_account_takes_its_card_picture(client, world):
    aid = client.post("/api/accounts", json={"name": "Old Card", "kind": "card"}).json()["id"]
    jpg = b"\xff\xd8\xff\xe0" + b"0" * 100
    assert client.put(f"/api/accounts/{aid}/art", files={"file": ("c.jpg", jpg, "image/jpeg")}).status_code == 200
    assert client.delete(f"/api/accounts/{aid}").status_code == 204
    new = client.post("/api/accounts", json={"name": "New Card", "kind": "card"}).json()["id"]
    assert new == aid  # account ids are reused
    assert client.get("/api/cards").json()[str(new)]["art"] is None


def test_an_oversized_upload_is_refused_before_it_is_read(client, world, monkeypatch):
    from starlette.requests import Request

    def never(*a, **k):
        raise AssertionError("the form was parsed")
    monkeypatch.setattr(Request, "_get_form", never)
    monkeypatch.setattr(api_files, "MAX_BYTES", 1000)
    big = b"\xff\xd8\xff\xe0" + b"0" * 200_000
    tid = client.post("/api/transactions", json={"date": "2026-09-10", "amount": 1, "category_id": world["food"],
                                                  "from_id": world["card"], "what": "Market"}).json()["id"]
    r = client.post(f"/api/transactions/{tid}/receipt", files={"file": ("r.jpg", big, "image/jpeg")})
    assert r.status_code == 413 and r.json()["detail"]["errors"]
    r = client.put(f"/api/accounts/{world['card']}/art", files={"file": ("c.jpg", big, "image/jpeg")})
    assert r.status_code == 413
