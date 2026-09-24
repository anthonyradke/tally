"""JSON API — settings-style CRUD: accounts, categories, favorites (quick actions), budgets, saved views, and the
settings table (recurring templates live in api_recurring). Table/column names below are code constants, never input."""
from __future__ import annotations
import json
import sqlite3
from datetime import date
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from . import db
from .api import Con
from .engine import KINDS, TYPES, cents, month_of

router = APIRouter(prefix="/api")
SETTING_KEYS = {"start_month", "ef_months", "roth_limit", "home_layout", "theme", "merchant_marks", "roth_category",
                "interest_category"}


def _pct(v):
    return float(v) / 100 if v not in (None, "") else None


def _opt_int(v):
    return int(v) if v not in (None, "", 0, "0") else None


def _upsert(con, table: str, fields: dict, id: Optional[int]) -> int:
    cols = list(fields)
    if id:
        con.execute(f"UPDATE {table} SET {', '.join(c + '=?' for c in cols)} WHERE id=?", [*fields.values(), id])
        return id
    cur = con.execute(f"INSERT INTO {table}({', '.join(cols)}) VALUES({', '.join('?' * len(cols))})",
                      list(fields.values()))
    return cur.lastrowid


def _get(con, table: str, id: int) -> dict:
    r = con.execute(f"SELECT * FROM {table} WHERE id=?", (id,)).fetchone()
    if not r:
        raise HTTPException(404)
    return dict(r)


def _delete(con, table: str, id: int):
    try:
        con.execute(f"DELETE FROM {table} WHERE id=?", (id,))
        con.commit()
    except sqlite3.IntegrityError:
        con.rollback()
        raise HTTPException(409, {"errors": ["It's still used by entries, quick actions, recurring or budgets. "
                                             "Switch off Active to hide it instead."]})
    return Response(status_code=204)


def _reorder(con, table: str, ids: list[int]):
    for i, id in enumerate(ids):
        con.execute(f"UPDATE {table} SET sort=? WHERE id=?", (i, int(id)))
    con.commit()
    return {"ok": True}


@router.get("/admin")
def admin(con: Con):
    """Everything Settings needs, including inactive accounts/categories."""
    rows = lambda sql: [dict(r) for r in con.execute(sql)]
    return {"accounts": rows("SELECT * FROM accounts ORDER BY sort, id"),
            "categories": rows("SELECT * FROM categories ORDER BY sort, id"),
            "favorites": rows("SELECT * FROM favorites ORDER BY sort, id"),
            "recurring": rows("SELECT * FROM recurring ORDER BY active DESC, next_date"),
            "saved_views": rows("SELECT * FROM saved_views ORDER BY sort, id"),
            "budgets": rows("SELECT * FROM budgets ORDER BY month"),
            "settings": {r["key"]: r["value"] for r in con.execute("SELECT * FROM settings")}}


# ---------- accounts ----------
def _account_fields(b: dict) -> dict:
    """APY and loan rate are left alone when the body omits them: the editor shows them rounded, and re-saving the
    rounded figure would nudge a rate imported to full precision."""
    if b.get("kind") not in KINDS:
        raise HTTPException(422, {"errors": ["Bad account kind."]})
    if not (b.get("name") or "").strip():
        raise HTTPException(422, {"errors": ["Name is required."]})
    fields = {"name": b["name"].strip(), "kind": b["kind"], "bank": b.get("bank") or None,
              "start_balance": cents(b.get("start_balance") or 0), "apy": _pct(b.get("apy")),
              "loan_rate": _pct(b.get("loan_rate")), "ef": int(bool(b.get("ef"))), "sort": int(b.get("sort") or 0),
              "active": int(b.get("active", True)), "color": b.get("color") or None, "icon": b.get("icon") or None}
    return {k: v for k, v in fields.items() if k not in ("apy", "loan_rate") or k in b}


@router.put("/accounts/order")  # before /accounts/{id} so "order" is never parsed as an id
async def order_accounts(request: Request, con: Con):
    return _reorder(con, "accounts", (await request.json()).get("ids", []))


@router.post("/accounts", status_code=201)
async def create_account(request: Request, con: Con):
    id = _upsert(con, "accounts", _account_fields(await request.json()), None)
    con.commit()
    return _get(con, "accounts", id)


@router.put("/accounts/{id}")
async def update_account(id: int, request: Request, con: Con):
    _get(con, "accounts", id)
    _upsert(con, "accounts", _account_fields(await request.json()), id)
    con.commit()
    return _get(con, "accounts", id)


@router.delete("/accounts/{id}", status_code=204)
def delete_account(id: int, con: Con):
    return _delete(con, "accounts", id)


# ---------- categories ----------
def _category_fields(b: dict) -> dict:
    if b.get("type") not in TYPES:
        raise HTTPException(422, {"errors": ["Bad category type."]})
    if not (b.get("name") or "").strip():
        raise HTTPException(422, {"errors": ["Name is required."]})
    return {"name": b["name"].strip(), "type": b["type"], "sort": int(b.get("sort") or 0),
            "active": int(b.get("active", True)), "icon": b.get("icon") or None, "color": b.get("color") or None,
            "budget": cents(b["budget"]) if b.get("budget") not in (None, "") else None}


@router.put("/categories/order")  # before /categories/{id}
async def order_categories(request: Request, con: Con):
    return _reorder(con, "categories", (await request.json()).get("ids", []))


@router.post("/categories", status_code=201)
async def create_category(request: Request, con: Con):
    id = _upsert(con, "categories", _category_fields(await request.json()), None)
    con.commit()
    return _get(con, "categories", id)


@router.put("/categories/{id}")
async def update_category(id: int, request: Request, con: Con):
    _get(con, "categories", id)
    _upsert(con, "categories", _category_fields(await request.json()), id)
    con.commit()
    return _get(con, "categories", id)


@router.delete("/categories/{id}", status_code=204)
def delete_category(id: int, con: Con):
    return _delete(con, "categories", id)


# ---------- budgets ----------
@router.put("/budgets/{category_id}")
async def set_budget(category_id: int, request: Request, con: Con):
    """Body: {"amount": dollars | null, "month"?: "YYYY-MM-01"}. With month → override for that month only;
    without → the category's default. null clears."""
    b = await request.json()
    _get(con, "categories", category_id)
    amount = cents(b["amount"]) if b.get("amount") not in (None, "") else None
    if b.get("month"):
        if amount is None:
            con.execute("DELETE FROM budgets WHERE category_id=? AND month=?", (category_id, b["month"]))
        else:
            con.execute("INSERT OR REPLACE INTO budgets VALUES(?,?,?)", (category_id, b["month"], amount))
    else:
        con.execute("UPDATE categories SET budget=? WHERE id=?", (amount, category_id))
    con.commit()
    return {"ok": True}


# ---------- favorites (quick actions) ----------
def _favorite_fields(b: dict) -> dict:
    if not (b.get("label") or "").strip():
        raise HTTPException(422, {"errors": ["Label is required."]})
    return {"label": b["label"].strip(), "category_id": int(b["category_id"]),
            "from_account_id": _opt_int(b.get("from_account_id")), "to_account_id": _opt_int(b.get("to_account_id")),
            "amount": cents(b["amount"]) if b.get("amount") not in (None, "") else None,
            "sort": int(b.get("sort") or 0), "icon": b.get("icon") or None, "color": b.get("color") or None}


@router.post("/favorites", status_code=201)
async def create_favorite(request: Request, con: Con):
    id = _upsert(con, "favorites", _favorite_fields(await request.json()), None)
    con.commit()
    return _get(con, "favorites", id)


@router.put("/favorites/order")
async def order_favorites(request: Request, con: Con):
    return _reorder(con, "favorites", (await request.json()).get("ids", []))


@router.put("/favorites/{id}")
async def update_favorite(id: int, request: Request, con: Con):
    _get(con, "favorites", id)
    _upsert(con, "favorites", _favorite_fields(await request.json()), id)
    con.commit()
    return _get(con, "favorites", id)


@router.delete("/favorites/{id}", status_code=204)
def delete_favorite(id: int, con: Con):
    return _delete(con, "favorites", id)


# ---------- saved views ----------
def _view_fields(b: dict) -> dict:
    if not (b.get("name") or "").strip():
        raise HTTPException(422, {"errors": ["Name is required."]})
    return {"name": b["name"].strip(), "query": b.get("query") or "", "icon": b.get("icon") or None,
            "sort": int(b.get("sort") or 0)}


@router.post("/saved-views", status_code=201)
async def create_view(request: Request, con: Con):
    id = _upsert(con, "saved_views", _view_fields(await request.json()), None)
    con.commit()
    return _get(con, "saved_views", id)


@router.put("/saved-views/order")
async def order_views(request: Request, con: Con):
    return _reorder(con, "saved_views", (await request.json()).get("ids", []))


@router.put("/saved-views/{id}")
async def update_view(id: int, request: Request, con: Con):
    _get(con, "saved_views", id)
    _upsert(con, "saved_views", _view_fields(await request.json()), id)
    con.commit()
    return _get(con, "saved_views", id)


@router.delete("/saved-views/{id}", status_code=204)
def delete_view(id: int, con: Con):
    return _delete(con, "saved_views", id)


# ---------- settings ----------
@router.put("/settings")
async def put_settings(request: Request, con: Con):
    """Body: {key: value}. roth_limit arrives in dollars; home_layout and merchant_marks may be objects (stored as JSON)."""
    for k, v in (await request.json()).items():
        if k not in SETTING_KEYS:
            raise HTTPException(422, {"errors": [f"Unknown setting {k}."]})
        if k == "start_month":  # every balance starts here: a bad value would break every screen
            try:
                v = month_of(date.fromisoformat(str(v))).isoformat()
            except ValueError:
                raise HTTPException(422, {"errors": ["The start month must be a date like 2026-08-01."]})
        elif k == "roth_limit":
            v = str(cents(v or 0))
        elif k == "ef_months":
            v = str(int(v))
        elif k in ("roth_category", "interest_category"):
            v = str(int(v)) if v else ""
            if v and not con.execute("SELECT 1 FROM categories WHERE id=?", (int(v),)).fetchone():
                raise HTTPException(422, {"errors": ["That category doesn't exist."]})
        elif k in ("home_layout", "merchant_marks") and not isinstance(v, str):
            v = json.dumps(v)
        db.set_setting(con, k, str(v))
    con.commit()
    return {r["key"]: r["value"] for r in con.execute("SELECT * FROM settings")}
