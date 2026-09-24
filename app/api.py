"""JSON API core: bootstrap + transactions. Thin by design: rules live in engine/service; this shapes I/O.
Amounts are integer cents on the wire except request bodies, which carry dollars (see ios/src/lib/api.ts).
Companion routers: api_ops (reconcile, month end), api_admin (settings CRUD), api_recurring, api_files (receipts).
Every route takes `con: Con`, a connection that lives exactly as long as the request (db.session)."""
from __future__ import annotations
import sqlite3
import uuid
from dataclasses import replace
from datetime import date
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from . import db, service, recurring
from .engine import validate
from .entries import META_COLS, _client_id, _full, _landed, _parse, _remove, _sent, _txn, _write
from .inputs import body, day, ids as id_list, money, opt_id, whole, words

router = APIRouter(prefix="/api")
Con = Annotated[sqlite3.Connection, Depends(db.session)]


def _acct(a, x: dict):
    return {"id": a.id, "name": a.name, "kind": a.kind, "bank": a.bank, "start_balance": a.start_balance,
            "apy": a.apy, "loan_rate": a.loan_rate, "ef": a.ef, "color": x.get("color"), "icon": x.get("icon"),
            "active": bool(x.get("active", 1))}


def _cat(c, x: dict):
    return {"id": c.id, "name": c.name, "type": c.type, "icon": x.get("icon"), "color": x.get("color"),
            "budget": x.get("budget"), "active": bool(x.get("active", 1))}


def _row(r):
    return {"month": r.month.isoformat(), "money_in": r.money_in, "spent": r.spent, "loan": r.loan,
            "saving": r.saving, "left_over": r.left_over, "by_category": r.by_category, "balances": r.balances,
            "cash": r.cash, "invested": r.invested, "cards": r.cards, "loans": r.loans, "net_worth": r.net_worth}


def _meta(con) -> dict[int, dict]:
    return {r["id"]: dict(r) for r in con.execute(f"SELECT id,{','.join(META_COLS)} FROM transactions")}


def _by_id(con, table: str) -> dict[int, dict]:
    return {r["id"]: dict(r) for r in con.execute(f"SELECT * FROM {table}")}


# ---------- read ----------
@router.get("/bootstrap")
def bootstrap(con: Con):
    """Everything a screen needs except the transaction list. Also materialises due recurring rows and clears out
    receipt files no entry has pointed at for a day. Accounts and categories include hidden ones (`active`)."""
    from .api_files import sweep
    recurring.generate(con, date.today())
    sweep(con)
    st = service.load(con)
    goal, progress = st.ef()
    acc_x, cat_x = _by_id(con, "accounts"), _by_id(con, "categories")
    rows = lambda sql: [dict(r) for r in con.execute(sql)]
    settings = {r["key"]: r["value"] for r in con.execute("SELECT * FROM settings")}
    return {"today": st.today.isoformat(), "start": st.start.isoformat(),
            "accounts": [_acct(a, acc_x.get(a.id, {})) for a in st.accounts],
            "categories": [_cat(c, cat_x.get(c.id, {})) for c in st.categories],
            "favorites": rows("SELECT * FROM favorites ORDER BY sort, id"),
            "budgets": rows("SELECT * FROM budgets"),
            "recurring": rows("SELECT * FROM recurring WHERE active=1 ORDER BY next_date"),
            "saved_views": rows("SELECT * FROM saved_views ORDER BY sort, id"),
            "settings": settings, "months": [_row(r) for r in st.rows],
            "ef": {"goal": goal, "progress": progress},
            "roth": {"ytd": st.roth_ytd(), "limit": int(settings.get("roth_limit", 0)),
                     "category_id": st.category_for("roth_category", "Roth IRA")}}


@router.get("/transactions")
def transactions(con: Con, q: str = "", category: Optional[int] = None, account: Optional[int] = None, type: str = "",
                 start: str = "", end: str = "", amount_min: Optional[float] = None,
                 amount_max: Optional[float] = None, tag: str = "", group: str = "",
                 sort: str = "date", dir: str = "desc", limit: int = 200, offset: int = 0):
    """Filtered list. Search matches description, note, tags, category, account names and the amount.
    `by_type` sums the matches per category type, so the client can show a real net across types."""
    first, last = day(start, "Start") if start else None, day(end, "End") if end else None
    st = service.load(con)
    meta = _meta(st.con)
    items = list(st.txns)
    if q:
        needle = q.lower().strip()
        digits = needle.replace("$", "").replace(",", "")

        def hit(t):
            m = meta.get(t.id, {})
            names = [t.what, m.get("note") or "", m.get("tags") or "", st.cat[t.category_id].name]
            names += [st.acct[a].name for a in (t.from_id, t.to_id) if a in st.acct]
            return any(needle in s.lower() for s in names) or (digits and digits in f"{abs(t.amount) / 100:.2f}")
        items = [t for t in items if hit(t)]
    if category:
        items = [t for t in items if t.category_id == category]
    if account:
        items = [t for t in items if account in (t.from_id, t.to_id)]
    if type:
        items = [t for t in items if st.cat[t.category_id].type == type]
    if first:
        items = [t for t in items if t.date >= first]
    if last:
        items = [t for t in items if t.date <= last]
    if amount_min is not None:
        items = [t for t in items if abs(t.amount) >= money(amount_min, "Minimum")]
    if amount_max is not None:
        items = [t for t in items if abs(t.amount) <= money(amount_max, "Maximum")]
    if tag:
        items = [t for t in items if tag.lower().lstrip("#") in (meta.get(t.id, {}).get("tags") or "").split()]
    if group:
        items = [t for t in items if meta.get(t.id, {}).get("split_group") == group]
    key = (lambda t: (abs(t.amount), t.id or 0)) if sort == "amount" else (lambda t: (t.date, t.id or 0))
    items.sort(key=key, reverse=(dir != "asc"))
    by_type: dict[str, int] = {}
    for t in items:
        ty = st.cat[t.category_id].type
        by_type[ty] = by_type.get(ty, 0) + t.amount
    return {"total": len(items), "sum": sum(t.amount for t in items), "by_type": by_type,
            "items": [_txn(t, meta.get(t.id)) for t in items[offset:offset + limit]]}


# ---------- write (helpers in entries.py) ----------
@router.post("/transactions", status_code=201)
async def create_txn(request: Request, con: Con):
    b = await body(request)
    cid = _client_id(b)
    if cid and (done := _landed(con, cid)):
        return done[0]
    st = service.load(con)
    t, meta = _parse(b)
    try:
        tid = _write(st, t, {**meta, "client_id": cid})
    except sqlite3.IntegrityError:  # the same entry arrived twice at once and the other one won
        con.rollback()
        if cid and (done := _landed(con, cid)):
            return done[0]
        raise
    con.commit()
    return _full(con, [tid])[0]


@router.post("/transactions/split", status_code=201)
async def create_split(request: Request, con: Con):
    """Body: {"lines": [TxnInput, ...], "client_id"?: str}. All lines validate before any is written; they share one
    split_group. Line i stores client_id "<id>:<i>", so a retried split returns the rows already written."""
    b = await body(request)
    cid = _client_id(b)
    if cid and (done := _landed(con, f"{cid}:%")):
        return done
    st = service.load(con)
    if not isinstance(b.get("lines", []), list):
        raise HTTPException(422, {"errors": ["lines must be a list."]})
    lines = [_parse(x) for x in b.get("lines", [])]
    if len(lines) < 2:
        raise HTTPException(422, {"errors": ["A split needs at least two lines."]})
    if any(t.category_id not in st.cat for t, _ in lines):
        raise HTTPException(422, {"errors": ["Pick a category for every line."]})
    group = uuid.uuid4().hex[:12]
    errs = [e for t, _ in lines for e in validate(t, st.cat[t.category_id].type, st.acct)]
    if errs:
        raise HTTPException(422, {"errors": sorted(set(errs))})
    ids = [_write(st, t, {**m, "split_group": group, "client_id": f"{cid}:{i}" if cid else None})
           for i, (t, m) in enumerate(lines)]
    con.commit()
    rows = {r["id"]: r for r in _full(con, ids)}
    return [rows[i] for i in ids]


@router.get("/transactions/{txn_id}")
def one_txn(txn_id: int, con: Con):
    """One entry, for the composer: editing an old entry no longer depends on it being among the newest few."""
    rows = _full(con, [txn_id])
    if not rows:
        raise HTTPException(404)
    return rows[0]


@router.put("/transactions/{txn_id}")
async def update_txn(txn_id: int, request: Request, con: Con):
    st = service.load(con)
    if not any(t.id == txn_id for t in st.txns):
        raise HTTPException(404)
    b = await body(request)
    t, meta = _parse(b, txn_id)
    _write(st, t, _sent(b, meta))
    con.commit()
    return _full(con, [txn_id])[0]


@router.delete("/transactions/{txn_id}")
def delete_txn(txn_id: int, con: Con):
    gone = _remove(con, [txn_id])
    if not gone:
        raise HTTPException(404)
    return gone[0]


@router.post("/transactions/restore", status_code=201)
async def restore(request: Request, con: Con):
    """Undo for deletes. Body: {"rows": [Txn, ...]} as returned by a delete. Puts each row back exactly: same id
    (so it sorts where it was), note, tags, split, receipt and recurring link."""
    from .api_files import has_receipt
    st = service.load(con)
    rows = (await body(request)).get("rows", [])
    if not isinstance(rows, list) or not all(isinstance(b, dict) for b in rows):
        raise HTTPException(422, {"errors": ["rows must be a list of entries."]})
    ids = []
    for b in rows:
        t, meta = _parse(b, whole(b.get("id"), "id"))
        if con.execute("SELECT 1 FROM transactions WHERE id=?", (t.id,)).fetchone():
            raise HTTPException(409, {"errors": ["That entry is already back."]})
        if t.category_id not in st.cat or any(a and a not in st.acct for a in (t.from_id, t.to_id)):
            raise HTTPException(422, {"errors": ["Its category or account no longer exists."]})
        receipt = b.get("receipt") if isinstance(b.get("receipt"), str) and has_receipt(b["receipt"]) else None
        rid = opt_id(b.get("recurring_id"), "recurring_id")
        if rid and not con.execute("SELECT 1 FROM recurring WHERE id=?", (rid,)).fetchone():
            rid = None
        con.execute(
            "INSERT INTO transactions(id,date,what,category_id,from_account_id,to_account_id,amount,note,tags,"
            "split_group,receipt,recurring_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (t.id, t.date.isoformat(), t.what, t.category_id, t.from_id, t.to_id, t.amount, meta["note"],
             meta["tags"], meta["split_group"], receipt, rid))
        ids.append(t.id)
    con.commit()
    return _full(con, ids) if ids else []


@router.post("/transactions/bulk")
async def bulk(request: Request, con: Con):
    """Body: {"ids": [...], "action": "delete" | "recategorize" | "tag", "category_id"?: int, "tags"?: [..]}.
    Delete returns the removed rows for Undo. Recategorize checks every row against the new category's
    From/To rules first: moving spending into an income category would count it as income."""
    b = await body(request)
    ids = id_list(b.get("ids", []))
    if not ids:
        raise HTTPException(422, {"errors": ["No rows selected."]})
    marks = ",".join("?" * len(ids))
    if b.get("action") == "delete":
        return {"ok": True, "count": len(ids), "deleted": _remove(con, ids)}
    if b.get("action") == "recategorize":
        st = service.load(con)
        c = st.cat.get(opt_id(b.get("category_id"), "Category") or 0)
        if not c:
            raise HTTPException(422, {"errors": ["Pick a category."]})
        rows = [t for t in st.txns if t.id in set(ids)]
        errs = sorted({e for t in rows for e in validate(replace(t, category_id=c.id), c.type, st.acct)})
        if errs:
            raise HTTPException(422, {"errors": [f"Can't move {'that entry' if len(rows) == 1 else 'these'} to "
                                                 f"{c.name} ({c.type}).", *errs]})
        con.execute(f"UPDATE transactions SET category_id=? WHERE id IN ({marks})", [c.id, *ids])
    elif b.get("action") == "tag":
        add = {x.strip().lstrip("#").lower() for x in words(b.get("tags")) if x.strip()}
        if not add:
            raise HTTPException(422, {"errors": ["Type a tag."]})
        for r in con.execute(f"SELECT id, tags FROM transactions WHERE id IN ({marks})", ids).fetchall():
            merged = " ".join(sorted(set((r["tags"] or "").split()) | add))
            con.execute("UPDATE transactions SET tags=? WHERE id=?", (merged, r["id"]))
    else:
        raise HTTPException(422, {"errors": ["Unknown action."]})
    con.commit()
    return {"ok": True, "count": len(ids)}
