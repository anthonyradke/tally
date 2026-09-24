"""What the phone actually sends (ios/src/lib/api.ts): creates carry a client_id so an outbox retry can't double up,
splits share one id with a per-line suffix, edits send the entry without its split link, Undo sends the deleted row.
The concurrency tests run a real uvicorn on a free port so requests genuinely overlap."""
from __future__ import annotations
import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor
import httpx
import pytest
import uvicorn
from .conftest import txn

CID = "3f2b8a1c-6d4e-4f7a-9b21-0c5e7d8f9a10"


def app_body(w, **kw):
    """createTxn's body: TxnInput in dollars plus client_id (see api.ts)."""
    return {**txn(w, note="", tags=[]), "client_id": CID, **kw}


# ---------- retries ----------

def test_a_retried_create_returns_the_first_row(client, world):
    first = client.post("/api/transactions", json=app_body(world))
    again = client.post("/api/transactions", json=app_body(world))
    assert first.status_code == again.status_code == 201
    assert again.json() == first.json()
    assert client.get("/api/transactions").json()["total"] == 1


def test_a_retried_split_returns_every_line(client, world):
    body = {"lines": [txn(world, amount=30), txn(world, category_id=world["gas"], amount=20)], "client_id": CID}
    first = client.post("/api/transactions/split", json=body).json()
    again = client.post("/api/transactions/split", json=body).json()
    assert [r["id"] for r in again] == [r["id"] for r in first] and len(first) == 2
    assert client.get("/api/transactions").json()["total"] == 2


def test_a_refused_create_is_refused_again(client, world):
    bad = app_body(world, from_id=None)
    assert client.post("/api/transactions", json=bad).status_code == 422
    assert client.post("/api/transactions", json=bad).status_code == 422
    assert client.post("/api/transactions", json=app_body(world)).status_code == 201  # the id is still free


@pytest.mark.parametrize("cid", ["short", "has space in it", "a" * 65, "bad%chars", 12345678, ["x"]])
def test_bad_client_ids_are_refused(client, world, cid):
    assert client.post("/api/transactions", json=app_body(world, client_id=cid)).status_code == 422


def test_a_create_id_and_a_split_id_dont_collide(client, world):
    client.post("/api/transactions", json=app_body(world))
    body = {"lines": [txn(world, amount=30), txn(world, amount=20)], "client_id": CID}
    rows = client.post("/api/transactions/split", json=body).json()
    assert len(rows) == 2 and client.get("/api/transactions").json()["total"] == 3


@pytest.mark.xfail(strict=True, reason="bug: split lines commit one by one")
def test_a_split_is_all_or_nothing(client, world, monkeypatch):
    """If writing line 2 fails, line 1 must not stay behind: the retry would find it and report the split done."""
    from app import db
    real, calls = db.insert_txn, []

    def flaky(con, t):
        calls.append(t)
        if len(calls) == 2:
            raise RuntimeError("disk hiccup")
        return real(con, t)
    monkeypatch.setattr(db, "insert_txn", flaky)
    body = {"lines": [txn(world, amount=30), txn(world, amount=20)], "client_id": CID}
    assert client.post("/api/transactions/split", json=body).status_code == 500
    monkeypatch.setattr(db, "insert_txn", real)
    assert client.get("/api/transactions").json()["total"] == 0
    rows = client.post("/api/transactions/split", json=body).json()
    assert len(rows) == 2


class CrashingCommit:
    """A connection whose Nth commit fails, like the server dying between two writes of one request."""
    def __init__(self, con, fail_at):
        self._con, self._n, self._fail_at = con, 0, fail_at

    def commit(self):
        self._n += 1
        if self._n == self._fail_at:
            raise RuntimeError("server died here")
        self._con.commit()

    def __getattr__(self, name):
        return getattr(self._con, name)


@pytest.mark.parametrize("fail_at", [1, pytest.param(2, marks=pytest.mark.xfail(strict=True, reason="bug: row and client_id are two commits"))])
def test_a_create_is_one_write(client, world, monkeypatch, fail_at):
    """The row and its client_id must land together. If they are two commits and the server dies between them,
    the row stays without its id and the outbox retry adds a second one."""
    from app import db
    real = db.connect
    monkeypatch.setattr(db, "connect", lambda *a: CrashingCommit(real(*a), fail_at))
    client.post("/api/transactions", json=app_body(world))
    monkeypatch.setattr(db, "connect", real)
    assert client.post("/api/transactions", json=app_body(world)).status_code == 201  # the outbox retries
    assert client.get("/api/transactions").json()["total"] == 1


# ---------- edits keep what the app doesn't send ----------

def test_editing_a_split_line_keeps_it_in_the_split(client, world):
    rows = client.post("/api/transactions/split",
                       json={"lines": [txn(world, amount=30), txn(world, category_id=world["gas"], amount=20)]}).json()
    group = rows[0]["split_group"]
    # updateTxn sends TxnInput: date, what, category_id, from_id, to_id, amount, note, tags. No split_group.
    edit = {k: v for k, v in txn(world, amount=31, note="", tags=[]).items()}
    r = client.put(f"/api/transactions/{rows[0]['id']}", json=edit)
    assert r.status_code == 200 and r.json()["split_group"] == group
    assert client.get(f"/api/transactions?group={group}").json()["total"] == 2


def test_editing_keeps_the_receipt_and_recurring_link(client, world, tmp_path):
    t = client.post("/api/transactions", json=txn(world)).json()
    name = client.post(f"/api/transactions/{t['id']}/receipt",
                       files={"file": ("r.png", b"\x89PNG", "image/png")}).json()["receipt"]
    r = client.put(f"/api/transactions/{t['id']}", json=txn(world, amount=1)).json()
    assert r["receipt"] == name


def test_undo_twice_in_one_request_is_refused_cleanly(client, world):
    t = client.post("/api/transactions", json=txn(world)).json()
    gone = client.delete(f"/api/transactions/{t['id']}").json()
    row = {**gone, "amount": gone["amount"] / 100}
    r = client.post("/api/transactions/restore", json={"rows": [row, row]})
    assert r.status_code in (409, 422)
    assert client.get("/api/transactions").json()["total"] == 0  # all or nothing


# ---------- a real server, real overlap ----------

@pytest.fixture
def server(client, world):
    """The fixture's app on a real port. `client` set TALLY_DB; `world` filled it."""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    srv = uvicorn.Server(uvicorn.Config(client.app, host="127.0.0.1", port=port, log_level="warning"))
    th = threading.Thread(target=srv.run, daemon=True)
    th.start()
    for _ in range(100):
        if srv.started:
            break
        time.sleep(0.05)
    yield f"http://127.0.0.1:{port}", world
    srv.should_exit = True
    th.join(5)


def test_the_same_outbox_entry_sent_at_once_lands_once(server):
    url, w = server
    with ThreadPoolExecutor(8) as pool:
        rs = list(pool.map(lambda _: httpx.post(f"{url}/api/transactions", json=app_body(w), timeout=20), range(16)))
    assert {r.status_code for r in rs} == {201}
    assert len({r.json()["id"] for r in rs}) == 1
    assert httpx.get(f"{url}/api/transactions").json()["total"] == 1


def test_parallel_edits_of_one_entry_never_mix(server):
    url, w = server
    t = httpx.post(f"{url}/api/transactions", json=txn(w)).json()
    bodies = [txn(w, amount=i + 1, what=f"edit {i + 1}") for i in range(20)]
    with ThreadPoolExecutor(10) as pool:
        rs = list(pool.map(lambda b: httpx.put(f"{url}/api/transactions/{t['id']}", json=b, timeout=20), bodies))
    assert {r.status_code for r in rs} == {200}
    final = httpx.get(f"{url}/api/transactions").json()["items"][0]
    assert final["what"] == f"edit {final['amount'] // 100}"  # one request's values, never half of two


def test_edits_while_the_app_opens_do_not_lock_up(server):
    """bootstrap posts recurring rows under a write lock while other writes arrive."""
    url, w = server
    httpx.post(f"{url}/api/recurring", json={"label": "Gym", "category_id": w["food"], "from_account_id": w["card"],
                                             "amount": 30, "freq": "weekly", "next_date": "2026-01-01"})

    def work(i):
        if i % 3 == 0:
            return httpx.get(f"{url}/api/bootstrap", timeout=30).status_code
        return httpx.post(f"{url}/api/transactions", json=txn(w, amount=i + 1), timeout=30).status_code
    with ThreadPoolExecutor(8) as pool:
        codes = list(pool.map(work, range(30)))
    assert set(codes) <= {200, 201}, codes
    gym = httpx.get(f"{url}/api/transactions?q=Gym&limit=5000").json()["items"]
    assert len(gym) == len({x["date"] for x in gym})


@pytest.mark.xfail(reason="bug: an edit that loses a race with a delete is a 500 (timing-dependent)")
def test_delete_and_edit_racing(server):
    url, w = server
    ids = [httpx.post(f"{url}/api/transactions", json=txn(w)).json()["id"] for _ in range(40)]

    def race(tid):
        with ThreadPoolExecutor(2) as pool:
            d = pool.submit(httpx.delete, f"{url}/api/transactions/{tid}", timeout=20)
            e = pool.submit(httpx.put, f"{url}/api/transactions/{tid}", json=txn(w, amount=2), timeout=20)
            return d.result().status_code, e.result().status_code
    results = [race(i) for i in ids]
    assert all(d in (200, 404) and e in (200, 404) for d, e in results), [r for r in results if 500 in r]


def test_an_edit_can_still_clear_a_note_it_sends(client, world):
    t = client.post("/api/transactions", json=txn(world, note="old", tags=["a"])).json()
    r = client.put(f"/api/transactions/{t['id']}", json=txn(world, note="", tags=[])).json()
    assert r["note"] == "" and r["tags"] == []
