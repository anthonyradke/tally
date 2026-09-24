"""Receipts (limits, types, traversal, Undo) and the CSV exports (shape and round trip)."""
from __future__ import annotations
import csv
import io
import pytest
from app import api_files
from app.engine import cents
from .conftest import txn

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def upload(client, tid, data=PNG, name="r.png", ctype="image/png"):
    return client.post(f"/api/transactions/{tid}/receipt", files={"file": (name, data, ctype)})


@pytest.fixture
def entry(client, world):
    return client.post("/api/transactions", json=txn(world)).json()


def test_upload_limit(client, entry):
    assert upload(client, entry["id"], b"0" * api_files.MAX_BYTES).status_code == 200
    r = upload(client, entry["id"], b"0" * (api_files.MAX_BYTES + 1))
    assert r.status_code == 413 and "12 MB" in r.json()["detail"]["errors"][0]


@pytest.mark.parametrize("ctype", ["text/plain", "image/gif", "application/octet-stream", "text/html", ""])
def test_wrong_types_are_refused(client, entry, ctype):
    assert upload(client, entry["id"], ctype=ctype).status_code == 422


@pytest.mark.parametrize("ctype,ext", list(api_files.EXT.items()))
def test_allowed_types_keep_their_extension(client, entry, ctype, ext):
    name = upload(client, entry["id"], ctype=ctype).json()["receipt"]
    assert name.startswith(f"{entry['id']}-") and name.endswith("." + ext)


@pytest.mark.parametrize("filename", ["../../etc/passwd.png", "..\\..\\x.png", "/abs/path.png", "a\x00b.png", "ü.png"])
def test_client_filenames_never_reach_the_disk(client, entry, tmp_path, filename):
    name = upload(client, entry["id"], name=filename).json()["receipt"]
    assert api_files.SAFE.match(name) and (tmp_path / "receipts" / name).is_file()
    assert {p.name for p in tmp_path.iterdir()} <= {"receipts", "t.db", "t.db-shm", "t.db-wal"}


@pytest.mark.parametrize("path", ["%2e%2e%2f%2e%2e%2ft.db", "..%2ft.db", "%2e%2e", ".png", "x.png%00.txt",
                                  "t.db", "..%5ct.db", "%252e%252e%252ft.db", "a.b.png", "%2Fetc%2Fpasswd"])
def test_receipt_paths_cannot_escape(client, entry, path):
    upload(client, entry["id"])
    r = client.get(f"/api/receipts/{path}")
    assert r.status_code == 404 and b"SQLite" not in r.content


def test_replacing_and_deleting_a_receipt_cleans_up(client, entry, tmp_path):
    first = upload(client, entry["id"]).json()["receipt"]
    second = upload(client, entry["id"]).json()["receipt"]
    assert not (tmp_path / "receipts" / first).exists() and (tmp_path / "receipts" / second).exists()
    assert client.delete(f"/api/transactions/{entry['id']}/receipt").status_code == 204
    assert not (tmp_path / "receipts" / second).exists()
    assert client.delete(f"/api/transactions/{entry['id']}/receipt").status_code == 204  # nothing left: still fine


def test_undo_brings_the_receipt_back(client, entry):
    name = upload(client, entry["id"]).json()["receipt"]
    gone = client.delete(f"/api/transactions/{entry['id']}").json()
    assert gone["receipt"] == name
    back = client.post("/api/transactions/restore", json={"rows": [{**gone, "amount": gone["amount"] / 100}]}).json()
    assert back[0]["receipt"] == name and client.get(f"/api/receipts/{name}").status_code == 200


def test_restore_drops_a_receipt_name_that_isnt_a_file(client, entry):
    gone = client.delete(f"/api/transactions/{entry['id']}").json()
    back = client.post("/api/transactions/restore",
                       json={"rows": [{**gone, "amount": 12.34, "receipt": "../../t.db"}]}).json()
    assert back[0]["receipt"] is None


def test_sweep_keeps_files_in_use(client, entry, tmp_path):
    name = upload(client, entry["id"]).json()["receipt"]
    (tmp_path / "receipts" / "999-deadbeef.png").write_bytes(b"x")
    from app import db
    assert api_files.sweep(db.connect(), grace=0, every=0) == 1
    assert (tmp_path / "receipts" / name).exists()


# ---------- exports ----------

def _rows(client, path):
    r = client.get(path)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    return list(csv.reader(io.StringIO(r.text)))


def test_log_export_round_trips(client, world):
    tricky = ['Comma, "quoted"', "Line\nbreak", "Ünïcødé ☕", "=1+1", " "]
    for i, what in enumerate(tricky):
        client.post("/api/transactions", json=txn(world, what=what, amount=0.01 + i * 1234.56, date=f"2026-09-0{i + 1}"))
    client.post("/api/transactions", json=txn(world, "move", amount=100))
    client.put(f"/api/accounts/{world['card']}", json={"name": "Card", "kind": "card", "active": False})  # hidden
    rows = _rows(client, "/export/log.csv")
    head, body = rows[0], rows[1:]
    assert head == ["Date", "What it was", "Category", "From account", "To account", "Amount", "Month", "Type"]
    api_rows = client.get("/api/transactions?sort=date&dir=asc").json()["items"]
    names = {a["id"]: a["name"] for a in client.get("/api/admin").json()["accounts"]}
    cats = {c["id"]: c["name"] for c in client.get("/api/admin").json()["categories"]}
    assert len(body) == len(api_rows)
    for line, t in zip(body, api_rows, strict=True):
        assert line[0] == t["date"] and line[1] == t["what"] and line[2] == cats[t["category_id"]]
        assert line[3] == (names[t["from_id"]] if t["from_id"] else "") and line[4] == (names[t["to_id"]] if t["to_id"] else "")
        assert cents(line[5]) == t["amount"]  # dollars in the file, exact to the cent
        assert line[6] == t["date"][:8] + "01"


def test_months_export_matches_bootstrap(client, world):
    client.post("/api/transactions", json=txn(world, amount=19.99))
    client.post("/api/transactions", json=txn(world, "in", amount=2500))
    rows = _rows(client, "/export/months.csv")
    head = rows[0]
    assert all(len(r) == len(head) for r in rows)
    boot = client.get("/api/bootstrap").json()
    by_month = {m["month"]: m for m in boot["months"]}
    for r in rows[1:]:
        m = by_month[r[0]]
        assert cents(r[head.index("TOTAL SPENT")]) == m["spent"]
        assert cents(r[head.index("NET WORTH")]) == m["net_worth"]
        assert cents(r[head.index("LEFT OVER")]) == m["left_over"]


def test_exports_on_an_empty_database(client):
    assert len(_rows(client, "/export/log.csv")) == 1
    assert len(_rows(client, "/export/months.csv")) >= 2
