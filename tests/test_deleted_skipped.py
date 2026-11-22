"""Recently deleted names a skipped recurring date as a skip, so it isn't mistaken for a deletion and put back."""
from __future__ import annotations
from datetime import date
from .conftest import freeze, txn

TODAY = date(2026, 9, 24)


def _rent(client, world):
    body = {"label": "Rent", "category_id": world["food"], "from_account_id": world["chk"], "amount": 1000,
            "freq": "monthly", "next_date": "2026-10-01", "horizon_days": 45}
    t = client.post("/api/recurring", json=body).json()
    client.get("/api/bootstrap")
    return t


def _listed(client):
    return client.get("/api/deleted").json()


def test_a_skipped_date_is_listed_as_skipped_from_its_template(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t = _rent(client, world)
    client.post(f"/api/recurring/{t['id']}/skip", json={})  # Oct 1
    other = client.post("/api/transactions", json=txn(world, what="Market")).json()["id"]
    client.delete(f"/api/transactions/{other}")
    listed = _listed(client)
    assert [(x["what"], x["skipped_from"]) for x in listed] == [("Market", None), ("Rent", "Rent")]
    # Putting it back posts the date again, and the skip goes with it.
    back = {k: v for k, v in listed[1].items() if k not in ("deleted_at", "batch", "skipped_from")}
    assert client.post("/api/transactions/restore", json={"rows": [{**back, "amount": back["amount"] / 100}]}).status_code == 201
    assert client.get("/api/admin").json()["skips"] == []


def test_a_scheduled_row_deleted_before_its_day_counts_as_a_skip_too(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t = _rent(client, world)
    row = next(x for x in client.get("/api/transactions?q=Rent").json()["items"] if x["date"] == "2026-10-01")
    client.delete(f"/api/transactions/{row['id']}")
    assert [x["skipped_from"] for x in _listed(client)] == ["Rent"]
    assert client.get("/api/admin").json()["skips"] == [{"recurring_id": t["id"], "date": "2026-10-01"}]


def test_rows_a_template_delete_took_are_plain_deletions(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t = _rent(client, world)
    client.post(f"/api/recurring/{t['id']}/skip", json={})
    client.delete(f"/api/recurring/{t['id']}")
    assert {x["skipped_from"] for x in _listed(client)} == {None}
