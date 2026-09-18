"""JSON API core: bootstrap + transactions. Thin by design: rules live in engine/service; this shapes I/O.
Amounts are integer cents on the wire except request bodies, which carry dollars (see web/src/api/client.ts).
Companion routers: api_ops (reconcile, month end), api_admin (settings CRUD), api_files (receipts)."""
from __future__ import annotations
import uuid
from datetime import date
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from . import db, service, recurring
from .engine import Txn, cents, validate

router = APIRouter(prefix="/api")
META_COLS = ("note", "tags", "split_group", "receipt", "recurring_id")


def _state():
    return service.load(db.connect())


def _acct(a, x: dict):
    return {"id": a.id, "name": a.name, "kind": a.kind, "bank": a.bank, "start_balance": a.start_balance,
            "apy": a.apy, "loan_rate": a.loan_rate, "ef": a.ef, "color": x.get("color"), "icon": x.get("icon")}


def _cat(c, x: dict):
    return {"id": c.id, "name": c.name, "type": c.type, "icon": x.get("icon"), "color": x.get("color"),
            "budget": x.get("budget")}


def _txn(t, m: Optional[dict] = None):
    m = m or {}
    return {"id": t.id, "date": t.date.isoformat(), "what": t.what, "category_id": t.category_id,
            "from_id": t.from_id, "to_id": t.to_id, "amount": t.amount, "note": m.get("note") or "",
            "tags": (m.get("tags") or "").split(), "split_group": m.get("split_group"),
            "receipt": m.get("receipt"), "recurring_id": m.get("recurring_id")}


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
def bootstrap():
    """Everything a screen needs except the transaction list. Also materialises due recurring rows."""
    con = db.connect()
    recurring.generate(con, date.today())
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
            "roth": {"ytd": st.roth_ytd(), "limit": int(settings.get("roth_limit", 0))}}


@router.get("/transactions")
def transactions(q: str = "", category: Optional[int] = None, account: Optional[int] = None, type: str = "",
                 start: str = "", end: str = "", amount_min: Optional[float] = None,
                 amount_max: Optional[float] = None, tag: str = "", group: str = "",
                 sort: str = "date", dir: str = "desc", limit: int = 200, offset: int = 0):
    """Filtered list. Search matches description, note, tags, category, account names and the amount."""
    st = _state()
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
    if start:
        items = [t for t in items if t.date >= date.fromisoformat(start)]
    if end:
        items = [t for t in items if t.date <= date.fromisoformat(end)]
    if amount_min is not None:
        items = [t for t in items if abs(t.amount) >= cents(amount_min)]
    if amount_max is not None:
        items = [t for t in items if abs(t.amount) <= cents(amount_max)]
    if tag:
        items = [t for t in items if tag.lower().lstrip("#") in (meta.get(t.id, {}).get("tags") or "").split()]
    if group:
        items = [t for t in items if meta.get(t.id, {}).get("split_group") == group]
    key = (lambda t: (abs(t.amount), t.id or 0)) if sort == "amount" else (lambda t: (t.date, t.id or 0))
    items.sort(key=key, reverse=(dir != "asc"))
    return {"total": len(items), "sum": sum(t.amount for t in items),
            "items": [_txn(t, meta.get(t.id)) for t in items[offset:offset + limit]]}


# ---------- write ----------
def _parse(b: dict, txn_id: Optional[int] = None) -> tuple[Txn, dict]:
    try:
        t = Txn(txn_id, date.fromisoformat(b["date"]), (b.get("what") or "").strip(), int(b["category_id"]),
                int(b["from_id"]) if b.get("from_id") else None, int(b["to_id"]) if b.get("to_id") else None,
                cents(b.get("amount") or 0))
    except (KeyError, ValueError, TypeError) as e:
        raise HTTPException(422, {"errors": [f"Bad field: {e}"]})
    tags = b.get("tags") or []
    if isinstance(tags, str):
        tags = tags.split()
    meta = {"note": (b.get("note") or "").strip(),
            "tags": " ".join(sorted({x.strip().lstrip("#").lower() for x in tags if x.strip()})),
            "split_group": b.get("split_group") or None}
    return t, meta


def _save(st, t: Txn, meta: dict) -> dict:
    errs = service.save_txn(st.con, st, t)
    if errs:
        raise HTTPException(422, {"errors": errs})
    tid = t.id or st.con.execute("SELECT last_insert_rowid()").fetchone()[0]
    st.con.execute("UPDATE transactions SET note=?, tags=?, split_group=? WHERE id=?",
                   (meta["note"], meta["tags"], meta["split_group"], tid))
    st.con.commit()
    row = st.con.execute(f"SELECT id,{','.join(META_COLS)} FROM transactions WHERE id=?", (tid,)).fetchone()
    return _txn(Txn(tid, t.date, t.what, t.category_id, t.from_id, t.to_id, t.amount), dict(row))


@router.post("/transactions", status_code=201)
async def create_txn(request: Request):
    st = _state()
    t, meta = _parse(await request.json())
    return _save(st, t, meta)


@router.post("/transactions/split", status_code=201)
async def create_split(request: Request):
    """Body: {"lines": [TxnInput, ...]}. All lines validate before any is written; they share one split_group."""
    st = _state()
    lines = [_parse(b) for b in (await request.json()).get("lines", [])]
    if len(lines) < 2:
        raise HTTPException(422, {"errors": ["A split needs at least two lines."]})
    group = uuid.uuid4().hex[:12]
    errs = [e for t, _ in lines for e in validate(t, st.cat[t.category_id].type, st.acct)]
    if errs:
        raise HTTPException(422, {"errors": sorted(set(errs))})
    return [_save(st, t, {**m, "split_group": group}) for t, m in lines]


@router.put("/transactions/{txn_id}")
async def update_txn(txn_id: int, request: Request):
    st = _state()
    if not any(t.id == txn_id for t in st.txns):
        raise HTTPException(404)
    t, meta = _parse(await request.json(), txn_id)
    return _save(st, t, meta)


@router.delete("/transactions/{txn_id}", status_code=204)
def delete_txn(txn_id: int):
    from .api_files import remove_receipt
    con = db.connect()
    row = con.execute("SELECT receipt FROM transactions WHERE id=?", (txn_id,)).fetchone()
    if row and row["receipt"]:
        remove_receipt(row["receipt"])
    con.execute("DELETE FROM transactions WHERE id=?", (txn_id,))
    con.commit()
    return Response(status_code=204)


@router.post("/transactions/bulk")
async def bulk(request: Request):
    """Body: {"ids": [...], "action": "delete" | "recategorize" | "tag", "category_id"?: int, "tags"?: [..]}"""
    b = await request.json()
    ids = [int(i) for i in b.get("ids", [])]
    if not ids:
        raise HTTPException(422, {"errors": ["No rows selected."]})
    con = db.connect()
    marks = ",".join("?" * len(ids))
    if b.get("action") == "delete":
        con.execute(f"DELETE FROM transactions WHERE id IN ({marks})", ids)
    elif b.get("action") == "recategorize":
        con.execute(f"UPDATE transactions SET category_id=? WHERE id IN ({marks})", [int(b["category_id"]), *ids])
    elif b.get("action") == "tag":
        add = {x.strip().lstrip("#").lower() for x in b.get("tags", []) if x.strip()}
        for r in con.execute(f"SELECT id, tags FROM transactions WHERE id IN ({marks})", ids).fetchall():
            merged = " ".join(sorted(set((r["tags"] or "").split()) | add))
            con.execute("UPDATE transactions SET tags=? WHERE id=?", (merged, r["id"]))
    else:
        raise HTTPException(422, {"errors": ["Unknown action."]})
    con.commit()
    return {"ok": True, "count": len(ids)}
