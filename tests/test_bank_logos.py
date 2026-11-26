"""A connected bank's logo is Plaid's own where Plaid has one, ahead of the bank's website, also for logos cached
before that order changed. Made-up banks and images only; nothing reaches Plaid or logo.dev."""
from __future__ import annotations
import base64
import pytest
from app import api_logos, bank, logos
from tests.test_cards import png

PLAID = png(10, 10, lambda x, y: (0, 0, 0, 255))  # a bank's logo as Plaid draws it: black, edge to edge
SITE = png(10, 10, lambda x, y: (255, 255, 255, 255) if (x + y) % 3 else (20, 80, 200, 255))  # the website's


@pytest.fixture
def site(monkeypatch):
    """logo.dev answers with SITE for any website; every lookup is recorded."""
    monkeypatch.setenv("LOGO_DEV_KEY", "pk_test")
    asked: list[str] = []
    monkeypatch.setattr(logos, "_get", lambda url: asked.append(url) or SITE)
    return asked


def add_bank(item_id: str, logo: bytes | None, website: str | None = "https://bank.example.com",
             tally_account: int | None = None, color: str | None = None) -> int:
    b = bank.connect()
    try:
        cur = b.execute("INSERT INTO items(item_id, access_token, institution, website, logo, color) VALUES(?,?,?,?,?,?)",
                        (item_id, f"access-{item_id}", "Example Bank", website,
                         base64.b64encode(logo).decode() if logo else None, color))
        iid = cur.lastrowid
        if tally_account is not None:
            b.execute("INSERT INTO accounts(item_id, plaid_id, name, tally_account_id) VALUES(?,?,?,?)",
                      (iid, f"acc-{item_id}", "Card", tally_account))
        b.commit()
        return iid
    finally:
        b.close()


def test_a_bank_shows_plaids_logo_first(client, site):
    iid = add_bank("item-x", PLAID)
    r = client.get("/api/logo", params={"item": iid})
    assert r.status_code == 200 and r.content == PLAID
    assert site == []  # the website was never asked


def test_a_bank_without_a_plaid_logo_keeps_its_website(client, site):
    iid = add_bank("item-chase", None, "https://www.chase.com")
    r = client.get("/api/logo", params={"item": iid})
    assert r.status_code == 200 and r.content == SITE
    assert any("img.logo.dev/chase.com" in u for u in site)


def test_an_account_shows_its_banks_plaid_logo_first(client, world, site):
    add_bank("item-amex", PLAID, "https://www.americanexpress.com", tally_account=world["card"])
    r = client.get("/api/logo", params={"account": world["card"]})
    assert r.status_code == 200 and r.content == PLAID
    assert site == []


def test_logos_cached_in_the_old_order_are_looked_up_again(client, world, site):
    iid = add_bank("item-x", PLAID, tally_account=world["card"])
    # What the server had cached before: the website's logo, under the keys without a version.
    logos.store("item", "item-x", SITE)
    logos.store("account", api_logos._account_ident(client_con(client), world["card"]), SITE)
    assert client.get("/api/logo", params={"item": iid}).content == PLAID
    assert client.get("/api/logo", params={"account": world["card"]}).content == PLAID


def test_the_color_follows_the_same_image(client, world, site):
    iid = add_bank("item-x", PLAID, tally_account=world["card"])
    logos.store("item", "item-x", SITE)  # an old cached website logo, blue on white
    assert client.get("/api/logo/color", params={"item": iid}).json() == {"color": "#000000"}
    assert client.get("/api/logo/color", params={"account": world["card"]}).json() == {"color": "#000000"}
    # Plaid's own brand color still comes first where it has one.
    other = add_bank("item-y", PLAID, color="#0a50c8")
    assert client.get("/api/logo/color", params={"item": other}).json() == {"color": "#0A50C8"}


def test_an_account_logo_hidden_before_stays_hidden(client, world, site):
    add_bank("item-x", PLAID, tally_account=world["card"])
    logos.hide("account", api_logos._account_ident(client_con(client), world["card"]))  # hidden under the old key
    assert client.get("/api/logo", params={"account": world["card"]}).status_code == 404
    assert client.post("/api/logo/show", params={"account": world["card"]}).status_code == 204
    assert client.get("/api/logo", params={"account": world["card"]}).content == PLAID
    assert client.delete("/api/logo", params={"account": world["card"]}).status_code == 204
    assert client.get("/api/logo", params={"account": world["card"]}).status_code == 404


def test_names_still_try_the_website(client, site):
    r = client.get("/api/logo", params={"name": "Costco"})
    assert r.status_code == 200 and any("costco.com" in u for u in site)


def client_con(client):
    from app import db
    return db.connect()
