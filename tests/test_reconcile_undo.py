"""A reconciliation saved in one tap (Catch up's "Bank says the same", a match in Reconcile) can be taken back."""
from __future__ import annotations
from .conftest import txn


def test_saved_reconciliation_has_an_id_and_undo_removes_it(client, world):
    client.post("/api/transactions", json=txn(world, "in", date="2026-09-01", amount=100))
    d = client.post(f"/api/reconcile/{world['chk']}", json={"actual": 1100}).json()
    assert d["saved"] is False and d["id"] is None
    d = client.post(f"/api/reconcile/{world['chk']}", json={"actual": 1100, "save": True}).json()
    assert d["saved"] is True and isinstance(d["id"], int) and d["gap"] == 0
    assert [r["id"] for r in client.get("/api/reconciliations").json()] == [d["id"]]
    assert client.delete(f"/api/reconciliations/{d['id']}").status_code == 204
    assert client.get("/api/reconciliations").json() == []
    assert client.delete(f"/api/reconciliations/{d['id']}").status_code == 404
