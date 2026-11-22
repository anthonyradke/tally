"""Bootstrap lists the tags in use, most used first, so the app can offer them instead of free typing."""
from .conftest import txn


def test_bootstrap_counts_tags_most_used_first(client, world):
    assert client.get("/api/bootstrap").json()["tags"] == []
    for tags in (["trip", "work"], ["trip"], ["gift", "trip"], ["work"], []):
        assert client.post("/api/transactions", json=txn(world, tags=tags)).status_code == 201
    assert client.get("/api/bootstrap").json()["tags"] == [
        {"tag": "trip", "count": 3}, {"tag": "work", "count": 2}, {"tag": "gift", "count": 1}]


def test_deleted_entries_drop_out_of_the_tag_counts(client, world):
    row = client.post("/api/transactions", json=txn(world, tags=["Camping"])).json()
    assert client.get("/api/bootstrap").json()["tags"] == [{"tag": "camping", "count": 1}]
    assert client.delete(f"/api/transactions/{row['id']}").status_code == 200
    assert client.get("/api/bootstrap").json()["tags"] == []
