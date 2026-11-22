"""The token and tailnet-login check in app/auth.py."""
from __future__ import annotations

GOOD = {"Authorization": "Bearer s3cret", "Tailscale-User-Login": "owner@example"}


def test_open_without_a_token(client):
    assert client.get("/api/bootstrap").status_code == 200


def test_token_and_owner_required(client, monkeypatch):
    monkeypatch.setenv("TALLY_TOKEN", "s3cret")
    monkeypatch.setenv("TALLY_OWNER", "owner@example")
    assert client.get("/api/bootstrap").status_code == 401
    assert client.get("/api/bootstrap", headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/export/log.csv").status_code == 401
    assert client.get("/api/receipts/x.jpg").status_code == 401
    assert client.get("/api/bootstrap", headers={"Authorization": "Bearer s3cret"}).status_code == 403
    assert client.get("/api/bootstrap", headers={**GOOD, "Tailscale-User-Login": "someone@else"}).status_code == 403
    assert client.get("/api/bootstrap", headers=GOOD).status_code == 200


def test_token_only_when_no_owner(client, monkeypatch):
    monkeypatch.setenv("TALLY_TOKEN", "s3cret")
    monkeypatch.delenv("TALLY_OWNER", raising=False)
    assert client.get("/api/bootstrap", headers={"Authorization": "Bearer s3cret"}).status_code == 200


def test_no_docs(client):
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404


def test_writes_refused_without_the_token(client, monkeypatch):
    """A local process that skips Tailscale Serve can forge the login header, but not the token."""
    monkeypatch.setenv("TALLY_TOKEN", "s3cret")
    monkeypatch.setenv("TALLY_OWNER", "owner@example")
    forged = {"Tailscale-User-Login": "owner@example"}
    r = client.post("/api/accounts", json={"name": "Checking", "kind": "cash"}, headers=forged)
    assert r.status_code == 401
    assert client.delete("/api/transactions/1", headers=forged).status_code == 401
    assert client.put("/api/settings", json={"home_layout": "[]"}, headers=forged).status_code == 401
    accounts = client.get("/api/bootstrap", headers=GOOD).json()["accounts"]
    assert all(a["name"] != "Checking" for a in accounts)
    assert client.post("/api/accounts", json={"name": "Checking", "kind": "cash"}, headers=GOOD).status_code == 201
