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
from .engine import KINDS, TYPES, month_of
from .inputs import body, day, flag, ids, money, number, opt_id, opt_text, text, whole

router = APIRouter(prefix="/api")
SETTING_KEYS = {"start_month", "ef_months", "roth_limit", "home_layout", "theme", "merchant_marks", "roth_category",
                "interest_category"}


def _pct(v, what: str):
    return number(v, what) / 100 if v not in (None, "") else None


def _opt_int(v, what: str = "Account"):
    return opt_id(v, what)


def _upsert(con, table: str, fields: dict, id: Optional[int]) -> int:
    cols = list(fields)
    try:
        if id:
            con.execute(f"UPDATE {table} SET {', '.join(c + '=?' for c in cols)} WHERE id=?", [*fields.values(), id])
            return id
        cur = con.execute(f"INSERT INTO {table}({', '.join(cols)}) VALUES({', '.join('?' * len(cols))})",
                          list(fields.values()))
    except sqlite3.IntegrityError as e:
        con.rollback()
        if "UNIQUE" in str(e):
            raise HTTPException(409, {"errors": [f"There's already one called {fields.get('name')}."]})
        raise HTTPException(422, {"errors": ["That category or account doesn't exist."]})
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
        con.execute(f"UPDATE {table} SET sort=? WHERE id=?", (i, id))
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
    if not text(b.get("name"), "Name"):
        raise HTTPException(422, {"errors": ["Name is required."]})
    fields = {"name": text(b["name"], "Name"), "kind": b["kind"], "bank": opt_text(b.get("bank"), "Bank"),
              "start_balance": money(b.get("start_balance") or 0, "Starting balance"), "apy": _pct(b.get("apy"), "APY"),
              "loan_rate": _pct(b.get("loan_rate"), "Interest rate"), "ef": flag(bool(b.get("ef")), "Emergency fund"),
              "sort": whole(b.get("sort") or 0, "sort"), "active": flag(b.get("active", True), "Active"),
              "color": opt_text(b.get("color"), "Color"), "icon": opt_text(b.get("icon"), "Icon")}
    return {k: v for k, v in fields.items() if k not in ("apy", "loan_rate") or k in b}


@router.put("/accounts/order")  # before /accounts/{id} so "order" is never parsed as an id
async def order_accounts(request: Request, con: Con):
    return _reorder(con, "accounts", ids((await body(request)).get("ids", [])))


@router.post("/accounts", status_code=201)
async def create_account(request: Request, con: Con):
    id = _upsert(con, "accounts", _account_fields(await body(request)), None)
    con.commit()
    return _get(con, "accounts", id)


@router.put("/accounts/{id}")
async def update_account(id: int, request: Request, con: Con):
    _get(con, "accounts", id)
    _upsert(con, "accounts", _account_fields(await body(request)), id)
    con.commit()
    return _get(con, "accounts", id)


@router.delete("/accounts/{id}", status_code=204)
def delete_account(id: int, con: Con):
    return _delete(con, "accounts", id)


# ---------- categories ----------
def _category_fields(b: dict) -> dict:
    if b.get("type") not in TYPES:
        raise HTTPException(422, {"errors": ["Bad category type."]})
    if not text(b.get("name"), "Name"):
        raise HTTPException(422, {"errors": ["Name is required."]})
    return {"name": text(b["name"], "Name"), "type": b["type"], "sort": whole(b.get("sort") or 0, "sort"),
            "active": flag(b.get("active", True), "Active"), "icon": opt_text(b.get("icon"), "Icon"),
            "color": opt_text(b.get("color"), "Color"),
            "budget": money(b["budget"], "Budget") if b.get("budget") not in (None, "") else None}


@router.put("/categories/order")  # before /categories/{id}
async def order_categories(request: Request, con: Con):
    return _reorder(con, "categories", ids((await body(request)).get("ids", [])))


@router.post("/categories", status_code=201)
async def create_category(request: Request, con: Con):
    id = _upsert(con, "categories", _category_fields(await body(request)), None)
    con.commit()
    return _get(con, "categories", id)


@router.put("/categories/{id}")
async def update_category(id: int, request: Request, con: Con):
    _get(con, "categories", id)
    _upsert(con, "categories", _category_fields(await body(request)), id)
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
    b = await body(request)
    _get(con, "categories", category_id)
    amount = money(b["amount"], "Budget") if b.get("amount") not in (None, "") else None
    if b.get("month"):
        b["month"] = month_of(day(b["month"], "Month")).isoformat()
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
    if not text(b.get("label"), "Label"):
        raise HTTPException(422, {"errors": ["Label is required."]})
    if b.get("category_id") in (None, ""):
        raise HTTPException(422, {"errors": ["Pick a category."]})
    return {"label": text(b["label"], "Label"), "category_id": whole(b["category_id"], "Category"),
            "from_account_id": _opt_int(b.get("from_account_id"), "From"), "to_account_id": _opt_int(b.get("to_account_id"), "To"),
            "amount": money(b["amount"]) if b.get("amount") not in (None, "") else None,
            "sort": whole(b.get("sort") or 0, "sort"), "icon": opt_text(b.get("icon"), "Icon"), "color": opt_text(b.get("color"), "Color")}


@router.post("/favorites", status_code=201)
async def create_favorite(request: Request, con: Con):
    id = _upsert(con, "favorites", _favorite_fields(await body(request)), None)
    con.commit()
    return _get(con, "favorites", id)


@router.put("/favorites/order")
async def order_favorites(request: Request, con: Con):
    return _reorder(con, "favorites", ids((await body(request)).get("ids", [])))


@router.put("/favorites/{id}")
async def update_favorite(id: int, request: Request, con: Con):
    _get(con, "favorites", id)
    _upsert(con, "favorites", _favorite_fields(await body(request)), id)
    con.commit()
    return _get(con, "favorites", id)


@router.delete("/favorites/{id}", status_code=204)
def delete_favorite(id: int, con: Con):
    return _delete(con, "favorites", id)


# ---------- saved views ----------
def _view_fields(b: dict) -> dict:
    if not text(b.get("name"), "Name"):
        raise HTTPException(422, {"errors": ["Name is required."]})
    return {"name": text(b["name"], "Name"), "query": text(b.get("query"), "query"), "icon": opt_text(b.get("icon"), "Icon"),
            "sort": whole(b.get("sort") or 0, "sort")}


@router.post("/saved-views", status_code=201)
async def create_view(request: Request, con: Con):
    id = _upsert(con, "saved_views", _view_fields(await body(request)), None)
    con.commit()
    return _get(con, "saved_views", id)


@router.put("/saved-views/order")
async def order_views(request: Request, con: Con):
    return _reorder(con, "saved_views", ids((await body(request)).get("ids", [])))


@router.put("/saved-views/{id}")
async def update_view(id: int, request: Request, con: Con):
    _get(con, "saved_views", id)
    _upsert(con, "saved_views", _view_fields(await body(request)), id)
    con.commit()
    return _get(con, "saved_views", id)


@router.delete("/saved-views/{id}", status_code=204)
def delete_view(id: int, con: Con):
    return _delete(con, "saved_views", id)


# ---------- settings ----------
@router.put("/settings")
async def put_settings(request: Request, con: Con):
    """Body: {key: value}. roth_limit arrives in dollars; home_layout and merchant_marks may be objects (stored as JSON)."""
    for k, v in (await body(request)).items():
        if k not in SETTING_KEYS:
            raise HTTPException(422, {"errors": [f"Unknown setting {k}."]})
        if k == "start_month":  # every balance starts here: a bad value would break every screen
            try:
                v = month_of(date.fromisoformat(str(v))).isoformat()
            except ValueError:
                raise HTTPException(422, {"errors": ["The start month must be a date like 2026-08-01."]})
        elif k == "roth_limit":
            v = str(money(v or 0, "Roth limit"))
        elif k == "ef_months":
            v = str(whole(v, "Months of spending"))
        elif k in ("roth_category", "interest_category"):
            v = str(whole(v, "Category")) if v else ""
            if v and not con.execute("SELECT 1 FROM categories WHERE id=?", (int(v),)).fetchone():
                raise HTTPException(422, {"errors": ["That category doesn't exist."]})
        elif k in ("home_layout", "merchant_marks") and not isinstance(v, str):
            v = json.dumps(v)
        elif not isinstance(v, str):
            raise HTTPException(422, {"errors": [f"{k} must be text."]})
        db.set_setting(con, k, str(v))
    con.commit()
    return {r["key"]: r["value"] for r in con.execute("SELECT * FROM settings")}
