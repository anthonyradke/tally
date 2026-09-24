"""Reading and writing entries for the transaction routes in api.py: parsing a body, validating and writing a row
with its extras in one step, and shaping rows for the wire. Nothing here commits; each route commits once."""
from __future__ import annotations
import re
from datetime import date
from typing import Optional
from fastapi import HTTPException
from .engine import Txn, validate
from .inputs import day, money, opt_id, opt_text, text, whole, words

META_COLS = ("note", "tags", "split_group", "receipt", "recurring_id")


def _txn(t, m: Optional[dict] = None):
    m = m or {}
    return {"id": t.id, "date": t.date.isoformat(), "what": t.what, "category_id": t.category_id,
            "from_id": t.from_id, "to_id": t.to_id, "amount": t.amount, "note": m.get("note") or "",
            "tags": (m.get("tags") or "").split(), "split_group": m.get("split_group"),
            "receipt": m.get("receipt"), "recurring_id": m.get("recurring_id")}


def _parse(b: dict, txn_id: Optional[int] = None) -> tuple[Txn, dict]:
    if not isinstance(b, dict):
        raise HTTPException(422, {"errors": ["Each entry should be a JSON object."]})
    if b.get("category_id") in (None, ""):
        raise HTTPException(422, {"errors": ["Pick a category."]})
    t = Txn(txn_id, day(b.get("date")), text(b.get("what"), "Description"), whole(b["category_id"], "Category"),
            opt_id(b.get("from_id"), "From"), opt_id(b.get("to_id"), "To"), money(b.get("amount") or 0))
    tags = words(b.get("tags"))
    meta = {"note": text(b.get("note"), "Note"),
            "tags": " ".join(sorted({x.strip().lstrip("#").lower() for x in tags if x.strip()})),
            "split_group": opt_text(b.get("split_group"), "Split"), "client_id": None}
    return t, meta


def _sent(b: dict, meta: dict) -> dict:
    """An edit only changes the extras it sends. The app's edit leaves out split_group, and clearing it unlinked
    the entry from its split."""
    return {k: v for k, v in meta.items() if k in b or k == "client_id"}


def _client_id(b: dict) -> Optional[str]:
    """The outbox's id for a queued save. A retry whose first attempt did land returns that row instead of adding
    a second one (the phone can lose the response after the server wrote the row)."""
    cid = b.get("client_id")
    if cid is None:
        return None
    if not isinstance(cid, str) or not re.fullmatch(r"[A-Za-z0-9-]{8,64}", cid):
        raise HTTPException(422, {"errors": ["Bad client_id."]})
    return cid


def _landed(con, pattern: str) -> list[dict]:
    ids = [r[0] for r in con.execute("SELECT id FROM transactions WHERE client_id LIKE ?", (pattern,))]
    return _full(con, ids) if ids else []


def _write(st, t: Txn, meta: dict) -> int:
    """Validate and write one entry with its extras and client_id, without committing. Each request commits once,
    so a split, or a create and its client_id, lands whole or not at all: a half-written split used to look finished
    to the outbox's retry, and a row saved without its client_id got added again."""
    if t.category_id not in st.cat:
        raise HTTPException(422, {"errors": ["Pick a category."]})
    errs = validate(t, st.cat[t.category_id].type, st.acct)
    if errs:
        raise HTTPException(422, {"errors": errs})
    cols = {"date": t.date.isoformat(), "what": t.what, "category_id": t.category_id, "from_account_id": t.from_id,
            "to_account_id": t.to_id, "amount": t.amount, **{k: meta[k] for k in ("note", "tags", "split_group") if k in meta}}
    if t.id is None:
        cols["client_id"] = meta.get("client_id")
        return st.con.execute(f"INSERT INTO transactions({','.join(cols)}) VALUES({','.join('?' * len(cols))})",
                              list(cols.values())).lastrowid
    if not st.con.execute(f"UPDATE transactions SET {', '.join(k + '=?' for k in cols)} WHERE id=?",
                          [*cols.values(), t.id]).rowcount:
        raise HTTPException(404)  # deleted while this edit was on its way
    return t.id


def _full(con, ids: list[int]) -> list[dict]:
    marks = ",".join("?" * len(ids))
    return [_txn(Txn(r["id"], date.fromisoformat(r["date"]), r["what"], r["category_id"], r["from_account_id"],
                     r["to_account_id"], r["amount"]), dict(r))
            for r in con.execute(f"SELECT * FROM transactions WHERE id IN ({marks}) ORDER BY date, id", ids)]


def _remove(con, ids: list[int]) -> list[dict]:
    """Delete rows and return them as they were, for Undo. Receipt files stay on disk (marked as just orphaned)
    so Undo can bring them back; the sweep in api_files removes them a day later."""
    from .api_files import orphaned
    gone = _full(con, ids)
    con.execute(f"DELETE FROM transactions WHERE id IN ({','.join('?' * len(ids))})", ids)
    con.commit()
    orphaned([t["receipt"] for t in gone if t["receipt"]])
    return gone
