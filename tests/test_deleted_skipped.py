"""Recently deleted names a skipped recurring date as a skip, so it isn't mistaken for a deletion and put back."""
from __future__ import annotations
import sqlite3
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


def _oct1(client):
    return [x for x in client.get("/api/transactions?q=Rent").json()["items"] if x["date"] == "2026-10-01"]


def _put_back(client, row):
    back = {k: v for k, v in row.items() if k not in ("deleted_at", "batch", "skipped_from")}
    return client.post("/api/transactions/restore", json={"rows": [{**back, "amount": back["amount"] / 100}]})


def test_unskip_from_the_template_takes_the_row_off_recently_deleted(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t = _rent(client, world)
    client.delete(f"/api/transactions/{_oct1(client)[0]['id']}")  # listed as "Skipped from Rent"
    stale = _listed(client)[0]
    assert client.delete(f"/api/recurring/{t['id']}/skip/2026-10-01").status_code == 204
    assert len(_oct1(client)) == 1  # posted again
    assert _listed(client) == []  # nothing left to put back a second time
    # A row from before this fix, still listed elsewhere: putting it back would post Oct 1 twice.
    r = _put_back(client, stale)
    assert r.status_code == 409 and "already in" in r.json()["detail"]["errors"][0]
    assert len(_oct1(client)) == 1


def test_a_deleted_row_whose_date_is_posted_again_is_not_listed(client, world, monkeypatch, tmp_path):
    freeze(monkeypatch, TODAY)
    t = _rent(client, world)
    client.delete(f"/api/transactions/{_oct1(client)[0]['id']}")
    con = sqlite3.connect(tmp_path / "t.db")
    kept = con.execute("SELECT * FROM deleted").fetchall()
    client.delete(f"/api/recurring/{t['id']}/skip/2026-10-01")
    # Left behind by a server from before the unskip fix: hidden, since Oct 1 is posted again.
    con.executemany("INSERT INTO deleted VALUES(?,?,?)", kept)
    con.commit()
    con.close()
    other = client.post("/api/transactions", json=txn(world, what="Market")).json()["id"]
    client.delete(f"/api/transactions/{other}")
    assert [x["what"] for x in _listed(client)] == ["Market"]
