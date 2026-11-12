"""Regression tests for the 2026-11-11 review: inputs that broke every screen or returned 500, rules that restores and
month end skipped, and Settings links left pointing at deleted rows. All data is made up."""
from __future__ import annotations
from datetime import date
from .conftest import freeze, txn

TODAY = date(2026, 9, 24)


def test_only_json_bodies_are_read(client, world):
    """A web page can send text/plain to any address without a preflight: it must not count as JSON."""
    client.post("/api/transactions", json=txn(world))
    r = client.post("/api/transactions/bulk", content='{"ids":[1],"action":"delete"}',
                    headers={"content-type": "text/plain;charset=UTF-8", "origin": "https://example.com"})
    assert r.status_code == 415
    assert client.get("/api/transactions").json()["total"] == 1
    assert client.post("/api/transactions", json=txn(world)).status_code == 201


def test_month_end_months_must_be_in_the_ledger(client, world):
    assert client.post("/api/month-end/9999-12/typed", json={str(world["ira"]): 100}).status_code == 404
    assert client.post("/api/month-end/2099-01/interest", json={str(world["sav"]): 1}).status_code == 404
    assert client.post("/api/month-end/1999-01/interest", json={str(world["sav"]): 1}).status_code == 404
    assert client.get("/api/month-end/0000-05").status_code == 422
    assert client.get("/api/bootstrap").status_code == 200
    assert client.post("/api/month-end/2026-08/typed", json={str(world["ira"]): 100}).status_code == 200


def test_edge_inputs_are_4xx_not_500(client, world):
    assert client.get("/api/transactions?q=>" + "9" * 30).status_code == 200
    assert client.get("/api/transactions/99999999999999999999").status_code in (404, 422)
    assert client.get("/api/reconciliations?limit=99999999999999999999").status_code == 200  # clamped
    r = client.post("/api/transactions/bulk", json={"ids": list(range(40_000)), "action": "delete"})
    assert r.status_code == 422
    assert client.put("/api/settings", json={"start_month": "1000-01-01"}).status_code == 422
    assert client.post("/api/transactions", json=txn(world, tags=["x" * 200])).status_code == 422
    assert client.get("/api/bootstrap").status_code == 200


def test_restore_keeps_the_from_to_rules(client, world):
    row = client.post("/api/transactions", json=txn(world)).json()
    gone = client.delete(f"/api/transactions/{row['id']}").json()
    # Unused now, so the category may change type; the deleted Spending row no longer fits it.
    assert client.put(f"/api/categories/{world['food']}", json={"name": "Groceries", "type": "Money in"}).status_code == 200
    r = client.post("/api/transactions/restore", json={"rows": [{**gone, "amount": gone["amount"] / 100}]})
    assert r.status_code == 422
    zero = {**gone, "category_id": world["gas"], "amount": 0}
    assert client.post("/api/transactions/restore", json={"rows": [zero]}).status_code == 422


def test_restoring_a_template_ignores_a_bad_anchor(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t = client.post("/api/recurring", json={"label": "Rent", "category_id": world["food"], "from_account_id": world["chk"],
                                            "amount": 100, "freq": "monthly", "next_date": "2026-10-05"}).json()
    gone = client.delete(f"/api/recurring/{t['id']}").json()["template"]
    r = client.post("/api/recurring/restore", json={"template": {**gone, "anchor_day": -3}})
    assert r.status_code == 201 and r.json()["anchor_day"] == 5
    assert client.get("/api/bootstrap").status_code == 200


def test_weekly_to_monthly_aims_for_the_day_it_now_starts(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    body = {"label": "Gym", "category_id": world["food"], "from_account_id": world["chk"], "amount": 30,
            "freq": "weekly", "next_date": "2026-09-01"}
    t = client.post("/api/recurring", json=body).json()
    client.get("/api/bootstrap")
    nxt = client.get("/api/admin").json()["recurring"][0]["next_date"]
    t2 = client.put(f"/api/recurring/{t['id']}", json={**body, "freq": "monthly", "next_date": nxt}).json()
    client.get("/api/bootstrap")
    ahead = [x["date"] for x in client.get("/api/transactions?q=Gym&sort=date&dir=asc&start=2026-09-25").json()["items"]]
    assert t2["anchor_day"] == date.fromisoformat(ahead[0]).day
    assert all(date.fromisoformat(d).day == t2["anchor_day"] for d in ahead)
    assert len(ahead) == len(set(d[:7] for d in ahead))  # one a month, never two days apart


def test_interest_category_must_be_money_in(client, world):
    assert client.put("/api/settings", json={"interest_category": world["food"]}).status_code == 422
    assert client.put("/api/settings", json={"roth_category": world["pay"]}).status_code == 422
    assert client.put("/api/settings", json={"roth_category": world["roth"]}).status_code == 200


def test_deleting_a_category_switches_its_setting_off(client, world):
    c = client.post("/api/categories", json={"name": "Interest", "type": "Money in"}).json()["id"]
    client.put("/api/settings", json={"interest_category": c})
    assert client.delete(f"/api/categories/{c}").status_code == 204
    assert client.get("/api/admin").json()["settings"]["interest_category"] == ""
    new = client.post("/api/categories", json={"name": "Coffee", "type": "Spending"}).json()["id"]
    assert client.get("/api/admin").json()["settings"]["interest_category"] != str(new)


def test_an_account_with_only_reconciliations_can_be_deleted(client, world):
    a = client.post("/api/accounts", json={"name": "Old", "kind": "cash"}).json()["id"]
    client.post(f"/api/reconcile/{a}", json={"actual": 0, "save": True})
    assert client.delete(f"/api/accounts/{a}").status_code == 204
    client.post("/api/transactions", json=txn(world))
    r = client.delete(f"/api/accounts/{world['card']}")
    assert r.status_code == 409 and "entries" in r.json()["detail"]["errors"][0]


def test_month_end_leaves_out_investments_not_yet_opened(client, world):
    later = client.post("/api/accounts", json={"name": "New IRA", "kind": "investment", "opened": "2026-12"}).json()["id"]
    typed = client.get("/api/month-end/2026-09").json()["typed"]
    assert str(later) not in typed and str(world["ira"]) in typed


def test_receipts_are_served_with_nosniff(client, world):
    tid = client.post("/api/transactions", json=txn(world)).json()["id"]
    up = client.post(f"/api/transactions/{tid}/receipt", files={"file": ("r.png", b"\x89PNG....", "image/png")}).json()
    r = client.get(f"/api/receipts/{up['receipt']}")
    assert r.headers["x-content-type-options"] == "nosniff"


def test_exports_escape_formulas(client, world):
    client.post("/api/transactions", json=txn(world, what='=HYPERLINK("http://x","y")'))
    text = client.get("/export/log.csv").text
    assert text.startswith("﻿") and "'=HYPERLINK" in text


def test_undo_works_after_another_entry_was_added(client, world):
    """SQLite used to give a deleted id to the next new row, so Undo found it taken ("already back") and lost it."""
    client.post("/api/transactions", json=txn(world, what="A"))
    b = client.post("/api/transactions", json=txn(world, what="B")).json()
    gone = client.delete(f"/api/transactions/{b['id']}").json()
    c = client.post("/api/transactions", json=txn(world, what="C")).json()
    assert c["id"] != b["id"]
    r = client.post("/api/transactions/restore", json={"rows": [{**gone, "amount": gone["amount"] / 100}]})
    assert r.status_code == 201 and r.json()[0]["what"] == "B"


def test_recently_deleted_keeps_entries_and_restore_takes_them_off(client, world):
    ids = [client.post("/api/transactions", json=txn(world, what=w)).json()["id"] for w in ("A", "B", "C")]
    client.post("/api/transactions/bulk", json={"ids": ids[:2], "action": "delete"})
    client.delete(f"/api/transactions/{ids[2]}")
    listed = client.get("/api/deleted").json()
    assert [x["what"] for x in listed] == ["C", "B", "A"] and all(x["deleted_at"] for x in listed)
    back = {k: v for k, v in listed[1].items() if k != "deleted_at"}
    client.post("/api/transactions/restore", json={"rows": [{**back, "amount": back["amount"] / 100}]})
    assert [x["what"] for x in client.get("/api/deleted").json()] == ["C", "A"]
    assert client.delete("/api/deleted").status_code == 204 and client.get("/api/deleted").json() == []


def test_old_deletions_are_purged(client, world):
    from app import db
    from app.api_deleted import purge
    tid = client.post("/api/transactions", json=txn(world)).json()["id"]
    client.delete(f"/api/transactions/{tid}")
    con = db.connect()
    con.execute("UPDATE deleted SET deleted_at='2020-01-01T00:00:00+00:00'")
    con.commit()
    assert purge(con) == 1 and client.get("/api/deleted").json() == []


def test_old_databases_get_ids_that_never_come_back(tmp_path):
    """A database made before AUTOINCREMENT is rebuilt once with every row, column and index kept."""
    import sqlite3
    from app import db
    path = str(tmp_path / "old.db")
    old = sqlite3.connect(path)
    old.executescript(db.SCHEMA.replace("AUTOINCREMENT", ""))
    old.execute("INSERT INTO categories(id,name,type) VALUES(1,'Food','Spending')")
    old.execute("INSERT INTO accounts(id,name,kind) VALUES(1,'Card','card')")
    old.execute("INSERT INTO transactions(id,date,category_id,from_account_id,amount) VALUES(7,'2026-09-01',1,1,500)")
    old.commit()
    old.close()
    con = db.connect(path)
    assert "AUTOINCREMENT" in con.execute("SELECT sql FROM sqlite_master WHERE name='transactions'").fetchone()[0]
    assert "AUTOINCREMENT" in con.execute("SELECT sql FROM sqlite_master WHERE name='recurring'").fetchone()[0]
    assert [tuple(r) for r in con.execute("SELECT id, amount, note FROM transactions")] == [(7, 500, "")]
    idx = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='transactions'")}
    assert {"tx_date", "tx_split", "tx_recurring", "tx_client"} <= idx
    con.execute("DELETE FROM transactions WHERE id=7")
    new = con.execute("INSERT INTO transactions(date,category_id,from_account_id,amount) VALUES('2026-09-02',1,1,1)").lastrowid
    assert new == 8


def _rent(client, world, **kw):
    body = {"label": "Rent", "category_id": world["food"], "from_account_id": world["chk"], "amount": 1000,
            "freq": "monthly", "next_date": "2026-10-01", **kw}
    return client.post("/api/recurring", json=body).json(), body


def _rent_dates(client):
    return [x["date"] for x in client.get("/api/transactions?q=Rent&sort=date&dir=asc").json()["items"]]


def test_editing_a_template_keeps_a_row_moved_by_hand(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t, body = _rent(client, world, horizon_days=120)
    client.get("/api/bootstrap")
    oct_row = next(x for x in client.get("/api/transactions?q=Rent").json()["items"] if x["date"] == "2026-11-01")
    client.put(f"/api/transactions/{oct_row['id']}", json={**oct_row, "date": "2026-11-04", "amount": 10})
    nxt = client.get("/api/admin").json()["recurring"][0]["next_date"]
    client.put(f"/api/recurring/{t['id']}", json={**body, "amount": 1100, "next_date": nxt, "horizon_days": 120})
    client.get("/api/bootstrap")
    assert _rent_dates(client) == ["2026-10-01", "2026-11-04", "2026-12-01", "2027-01-01"]


def test_a_deleted_scheduled_row_stays_skipped_after_an_edit(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t, body = _rent(client, world, horizon_days=120)
    client.get("/api/bootstrap")
    nov = next(x for x in client.get("/api/transactions?q=Rent").json()["items"] if x["date"] == "2026-11-01")
    client.delete(f"/api/transactions/{nov['id']}")
    nxt = client.get("/api/admin").json()["recurring"][0]["next_date"]
    client.put(f"/api/recurring/{t['id']}", json={**body, "amount": 1100, "next_date": nxt, "horizon_days": 120})
    client.get("/api/bootstrap")
    assert "2026-11-01" not in _rent_dates(client)


def test_skip_once_and_undo(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t, _ = _rent(client, world, horizon_days=10)  # Oct 1 is posted, Nov 1 isn't yet
    client.get("/api/bootstrap")
    s = client.post(f"/api/recurring/{t['id']}/skip", json={}).json()
    assert s["date"] == "2026-10-01" and len(s["rows"]) == 1
    assert _rent_dates(client) == []
    assert client.get("/api/admin").json()["skips"] == [{"recurring_id": t["id"], "date": "2026-10-01"}]
    back = [{**x, "amount": x["amount"] / 100} for x in s["rows"]]
    assert client.post("/api/transactions/restore", json={"rows": back}).status_code == 201
    assert _rent_dates(client) == ["2026-10-01"] and client.get("/api/admin").json()["skips"] == []
    # A date not posted yet: skipped ahead of time, then taken back after the template moved past it.
    s2 = client.post(f"/api/recurring/{t['id']}/skip", json={"date": "2026-11-01"}).json()
    assert s2["rows"] == []
    freeze(monkeypatch, date(2026, 10, 25))  # Nov 1 is now within 10 days: passed over, not posted
    client.get("/api/bootstrap")
    assert "2026-11-01" not in _rent_dates(client)
    assert client.get("/api/admin").json()["recurring"][0]["next_date"] == "2026-12-01"
    assert client.delete(f"/api/recurring/{t['id']}/skip/2026-11-01").status_code == 204
    assert "2026-11-01" in _rent_dates(client)
    assert client.post(f"/api/recurring/{t['id']}/skip", json={"date": "2026-01-01"}).status_code == 422


def test_health(client, tmp_path, monkeypatch):
    status = tmp_path / "status.json"
    status.write_text('{"last_success": "2026-11-12T03:46:50+00:00", "backup": {"result": "ok"}}')
    monkeypatch.setenv("TALLY_CELLAR_STATUS", str(status))
    h = client.get("/api/health").json()
    assert h["database"] == "ok" and h["version"] != "unknown"
    assert h["offsite"] == {"last_success": "2026-11-12T03:46:50+00:00", "result": "ok"}
    assert h["backups"]["latest"] is None
    monkeypatch.setenv("TALLY_CELLAR_STATUS", str(tmp_path / "none.json"))
    assert client.get("/api/health").json()["offsite"] is None


CHASE = """Transaction Date,Post Date,Description,Category,Type,Amount,Memo
09/03/2026,09/04/2026,MARKET,Groceries,Sale,-12.34,
09/05/2026,09/06/2026,COFFEE SHOP,Food & Drink,Sale,-4.50,
09/09/2026,09/09/2026,MARKET,Groceries,Sale,-12.34,
09/12/2026,09/12/2026,Payment Thank You,,Payment,100.00,
"""


def test_statement_matches_lines_to_entries(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    client.post("/api/transactions", json=txn(world, date="2026-09-02"))  # a day before the statement's line
    client.post("/api/transactions", json=txn(world, date="2026-09-10"))
    client.post("/api/transactions", json=txn(world, date="2026-09-08", amount=60, what="Shoes"))
    r = client.post(f"/api/reconcile/{world['card']}/statement", json={"csv": CHASE}).json()
    assert r["first"] == "2026-09-03" and r["last"] == "2026-09-12"
    assert [(m["statement"]["date"], m["entry"]["date"]) for m in r["matched"]] == [("2026-09-03", "2026-09-02"),
                                                                                    ("2026-09-09", "2026-09-10")]
    assert [(x["what"], x["amount"]) for x in r["missing"]] == [("COFFEE SHOP", -450), ("Payment Thank You", 10000)]
    assert [x["what"] for x in r["extra"]] == ["Shoes"]


def test_statement_debit_credit_columns_and_bad_files(client, world):
    from app.statement import parse
    lines = parse("Bank export\nDate,Description,Debit,Credit,Balance\n2026-09-01,Rent,\"1,400.00\",,\n"
                  "2026-09-15,Paycheck,,2384.73,\n")
    assert [(x.what, x.amount) for x in lines] == [("Rent", -140000), ("Paycheck", 238473)]
    assert client.post(f"/api/reconcile/{world['chk']}/statement", json={"csv": "a,b\n1,2"}).status_code == 422
    assert client.post(f"/api/reconcile/{world['chk']}/statement", json={"csv": ""}).status_code == 422
    assert client.post("/api/reconcile/999/statement", json={"csv": CHASE}).status_code == 404
