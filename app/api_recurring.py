"""JSON API — recurring templates (see recurring.py for how they post). Split out of api_admin to keep files short.
Templates are validated like entries: generate() inserts their rows without further checks, so a template that
broke the From/To rules (a paycheck with only a From) would post rows that move money the wrong way."""
from __future__ import annotations
from datetime import date
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from . import db
from .api import Con
from .api_admin import _get, _opt_int, _upsert
from .engine import Txn, validate
from .inputs import body, day, flag, money, text, whole
from .recurring import first_on_or_after

router = APIRouter(prefix="/api")
FREQS = ("weekly", "biweekly", "monthly", "yearly")


def _horizon(v) -> int:
    """How many days ahead rows post. 0 posts on the day; a year is the most, since every day ahead is a row."""
    days = 45 if v in (None, "") else whole(v, "Days ahead")
    if not 0 <= days <= 366:
        raise HTTPException(422, {"errors": ["Days ahead must be between 0 and 366."]})
    return days


def _fields(con, b: dict) -> dict:
    if b.get("freq") not in FREQS:
        raise HTTPException(422, {"errors": ["Bad frequency."]})
    if not text(b.get("label"), "Label"):
        raise HTTPException(422, {"errors": ["Label is required."]})
    if b.get("category_id") in (None, ""):
        raise HTTPException(422, {"errors": ["Pick a category."]})
    nxt = day(b.get("next_date"), "Next date")
    f = {"label": text(b["label"], "Label"), "category_id": whole(b["category_id"], "Category"),
         "from_account_id": _opt_int(b.get("from_account_id"), "From"), "to_account_id": _opt_int(b.get("to_account_id"), "To"),
         "amount": money(b.get("amount") or 0), "what": text(b.get("what"), "Shows as"), "freq": b["freq"],
         "next_date": nxt.isoformat(), "horizon_days": _horizon(b.get("horizon_days")),
         "active": flag(b.get("active", True), "Active"), "anchor_day": nxt.day}
    cat = con.execute("SELECT type FROM categories WHERE id=?", (f["category_id"],)).fetchone()
    if not cat:
        raise HTTPException(422, {"errors": ["Pick a category."]})
    accounts = {a.id: a for a in db.load_accounts(con, active_only=False)}
    t = Txn(None, nxt, f["what"], f["category_id"], f["from_account_id"], f["to_account_id"], f["amount"])
    errs = validate(t, cat["type"], accounts)
    if errs:
        raise HTTPException(422, {"errors": errs})
    return f


@router.post("/recurring", status_code=201)
async def create_recurring(request: Request, con: Con):
    id = _upsert(con, "recurring", _fields(con, await body(request)), None)
    con.commit()
    return _get(con, "recurring", id)


@router.put("/recurring/{id}")
async def update_recurring(id: int, request: Request, con: Con):
    old = _get(con, "recurring", id)
    f = _fields(con, await body(request))
    if f["next_date"] == old["next_date"] and old["anchor_day"]:
        f["anchor_day"] = old["anchor_day"]  # unchanged date: keep aiming for the 31st even if next is Feb 28
    if f["active"] and not old["active"]:
        f["next_date"] = first_on_or_after(date.fromisoformat(f["next_date"]), f["freq"], f["anchor_day"],
                                           date.today()).isoformat()
    _upsert(con, "recurring", f, id)
    con.commit()
    return _get(con, "recurring", id)


@router.delete("/recurring/{id}", status_code=204)
def delete_recurring(id: int, con: Con):
    """Removes the template and any of its rows still in the future; posted rows stay."""
    con.execute("DELETE FROM transactions WHERE recurring_id=? AND date > ?", (id, date.today().isoformat()))
    con.execute("DELETE FROM recurring WHERE id=?", (id,))
    con.commit()
    return Response(status_code=204)
