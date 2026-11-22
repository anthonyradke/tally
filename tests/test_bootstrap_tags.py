"""Bootstrap lists the tags in use, most used first, so the app can offer them instead of free typing."""
from .conftest import txn


def test_bootstrap_counts_tags_most_used_first(client, world):
    assert client.get("/api/bootstrap").json()["tags"] == []
    for tags in (["trip", "work"], ["trip"], ["gift", "trip"], ["work"], []):
        assert client.post("/api/transactions", json=txn(world, tags=tags)).status_code == 201
    assert client.get("/api/bootstrap").json()["tags"] == [
        {"tag": "trip", "count": 3}, {"tag": "work", "count": 2}, {"tag": "gift", "count": 1}]


def test_a_split_purchase_counts_once(client, world):
    lines = [txn(world, tags=["trip"], amount=30), txn(world, category_id=world["gas"], tags=["trip"], amount=20)]
    assert client.post("/api/transactions/split", json={"lines": lines}).status_code == 201
    assert client.post("/api/transactions", json=txn(world, tags=["work"])).status_code == 201
    assert client.get("/api/bootstrap").json()["tags"] == [{"tag": "trip", "count": 1}, {"tag": "work", "count": 1}]


def test_deleted_entries_drop_out_of_the_tag_counts(client, world):
    row = client.post("/api/transactions", json=txn(world, tags=["Camping"])).json()
    assert client.get("/api/bootstrap").json()["tags"] == [{"tag": "camping", "count": 1}]
    assert client.delete(f"/api/transactions/{row['id']}").status_code == 200
    assert client.get("/api/bootstrap").json()["tags"] == []
