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
from .inputs import bad, body, day, far, flag, money, text, whole
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
    if nxt > far(date.today()):
        bad("The next date is more than ten years away. Check the year.")
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


def _counted(con, f: dict) -> dict:
    """An active template posts every date from next_date on, so one starting before the start month would post a
    backlog of rows that count nowhere. A paused one posts nothing, and resuming skips the missed dates."""
    start = db.setting(con, "start_month")
    if f["active"] and f["next_date"] < start:
        bad(f"Tally starts counting in {date.fromisoformat(start):%B %Y}. Pick a next date from then on.")
    return f


@router.post("/recurring", status_code=201)
async def create_recurring(request: Request, con: Con):
    id = _upsert(con, "recurring", _counted(con, _fields(con, await body(request))), None)
    con.commit()
    return _get(con, "recurring", id)


@router.put("/recurring/{id}")  # rows already posted for today and before stay as they are
async def update_recurring(id: int, request: Request, con: Con):
    old = _get(con, "recurring", id)
    f = _fields(con, await body(request))
    if f["next_date"] == old["next_date"] and old["anchor_day"]:
        f["anchor_day"] = old["anchor_day"]  # unchanged date: keep aiming for the 31st even if next is Feb 28
    # Rows it already posted for dates still ahead are replaced: they're posted again with the new amount, category and
    # accounts (or not at all while paused). Leaving them made an edit post a second row next to an old one, and a
    # new amount only showed up after the rows already scheduled.
    # Only rows still exactly as it posted them: one you changed by hand (an amount, a note, a receipt) stays, and
    # generate() won't post a second row on its date.
    same = ("recurring_id=? AND date > ? AND amount=? AND category_id=? AND from_account_id IS ? AND to_account_id IS ?"
            " AND what=? AND note='' AND tags='' AND receipt IS NULL AND split_group IS NULL")
    args = (id, date.today().isoformat(), old["amount"], old["category_id"], old["from_account_id"],
            old["to_account_id"], old["what"] or old["label"])
    ahead = con.execute(f"SELECT date FROM transactions WHERE {same} ORDER BY date", args).fetchall()
    if ahead:
        con.execute(f"DELETE FROM transactions WHERE {same}", args)
        if f["next_date"] == old["next_date"]:  # date untouched: start again from the first one that hadn't happened
            f["next_date"] = min(ahead[0]["date"], f["next_date"])
    if f["active"] and not old["active"]:
        f["next_date"] = first_on_or_after(date.fromisoformat(f["next_date"]), f["freq"], f["anchor_day"],
                                           date.today()).isoformat()
    _upsert(con, "recurring", _counted(con, f), id)
    con.commit()
    return _get(con, "recurring", id)


@router.delete("/recurring/{id}")
def delete_recurring(id: int, con: Con):
    """Removes the template and any of its rows still in the future; posted rows stay. Returns both as they were,
    for Undo: `restore_recurring` with the template, then /transactions/restore with the rows (hand-edited ones
    included, which re-posting from the template would lose)."""
    from .entries import _remove
    r = con.execute("SELECT * FROM recurring WHERE id=?", (id,)).fetchone()
    if not r:
        return Response(status_code=204)  # already gone: deleting again is harmless
    template = dict(r)
    ahead = [r[0] for r in con.execute("SELECT id FROM transactions WHERE recurring_id=? AND date > ?",
                                       (id, date.today().isoformat()))]
    rows = _remove(con, ahead) if ahead else []
    con.execute("DELETE FROM recurring WHERE id=?", (id,))
    con.commit()
    return {"template": template, "rows": rows}


@router.post("/recurring/restore", status_code=201)
async def restore_recurring(request: Request, con: Con):
    """Undo for a delete. Body: {"template": the row the delete returned}. Puts it back with the same id, so its
    rows can be restored with their link."""
    t = (await body(request)).get("template")
    if not isinstance(t, dict):
        bad("template must be an object.")
    id = whole(t.get("id"), "id")
    if con.execute("SELECT 1 FROM recurring WHERE id=?", (id,)).fetchone():
        raise HTTPException(409, {"errors": ["It's already back."]})
    f = _fields(con, {**t, "amount": whole(t.get("amount"), "Amount") / 100})
    f["anchor_day"] = t.get("anchor_day") if isinstance(t.get("anchor_day"), int) else f["anchor_day"]
    _upsert(con, "recurring", {"id": id, **f}, None)
    con.commit()
    return _get(con, "recurring", id)
