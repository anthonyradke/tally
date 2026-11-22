"""Recently deleted tells one bulk delete from separate deletes made in the same second."""
from __future__ import annotations
from .conftest import txn


def test_rows_deleted_together_share_a_batch_and_separate_deletes_do_not(client, world):
    ids = [client.post("/api/transactions", json=txn(world, what=w)).json()["id"] for w in ("A", "B", "C", "D")]
    client.post("/api/transactions/bulk", json={"ids": ids[:2], "action": "delete"})
    client.delete(f"/api/transactions/{ids[2]}")
    client.delete(f"/api/transactions/{ids[3]}")  # all within one second: deleted_at alone can't tell them apart
    listed = client.get("/api/deleted").json()
    assert [(x["what"], x["batch"]) for x in listed] == [("D", ids[3]), ("C", ids[2]), ("B", ids[0]), ("A", ids[0])]
    back = {k: v for k, v in listed[2].items() if k != "deleted_at"}  # a row as listed, batch and all, goes back
    assert client.post("/api/transactions/restore", json={"rows": [{**back, "amount": back["amount"] / 100}]}).status_code == 201
