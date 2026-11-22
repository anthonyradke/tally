"""Bulk account changes and the Undo for bulk edits, for `/api/transactions/bulk` in api.py."""
from __future__ import annotations
from dataclasses import replace
from fastapi import HTTPException
from . import service
from .engine import validate
from .inputs import opt_id, tag_set, whole


def move(con, ids: list[int], b: dict) -> None:
    """Every row gets `account_id` as its From (`side` "from") or its To. Checked like a recategorize: a Money in row
    can't take a From, and a transfer can't go to the account it came from. Doesn't commit."""
    side = b.get("side")
    if side not in ("from", "to"):
        raise HTTPException(422, {"errors": ["Pick From or To."]})
    st = service.load(con)
    a = st.acct.get(opt_id(b.get("account_id"), "Account") or 0)
    if not a:
        raise HTTPException(422, {"errors": ["Pick an account."]})
    rows = [replace(t, **{f"{side}_id": a.id}) for t in st.txns if t.id in set(ids)]
    errs = sorted({e for t in rows for e in validate(t, st.cat[t.category_id].type, st.acct)})
    if errs:
        raise HTTPException(422, {"errors": [f"Can't move {'that entry' if len(rows) == 1 else 'these'} to {a.name}.",
                                             *errs]})
    col = "from_account_id" if side == "from" else "to_account_id"  # a constant, never input
    con.execute(f"UPDATE transactions SET {col}=? WHERE id IN ({','.join('?' * len(ids))})", [a.id, *ids])


def revert(con, raw) -> dict:
    """Undo for a bulk recategorize, tag or account change: puts each row's category and tags back as `before` had
    them, and its accounts when `before` has them (only an account change sends them)."""
    if not isinstance(raw, list) or not raw or not all(isinstance(x, dict) for x in raw):
        raise HTTPException(422, {"errors": ["rows must be a list."]})
    st = service.load(con)
    txns = {t.id: t for t in st.txns}
    for x in raw:
        t = txns.get(whole(x.get("id"), "id"))
        c = st.cat.get(whole(x.get("category_id"), "Category"))
        if t is None or c is None:
            continue  # deleted since: nothing to put back
        if "from_id" in x or "to_id" in x:
            t = replace(t, from_id=opt_id(x.get("from_id"), "From"), to_id=opt_id(x.get("to_id"), "To"))
        if validate(replace(t, category_id=c.id), c.type, st.acct):
            continue  # edited since so that it no longer fits: leave it
        con.execute("UPDATE transactions SET category_id=?, tags=?, from_account_id=?, to_account_id=? WHERE id=?",
                    (c.id, " ".join(sorted(tag_set(x.get("tags")))), t.from_id, t.to_id, t.id))
    con.commit()
    return {"ok": True, "count": len(raw)}
