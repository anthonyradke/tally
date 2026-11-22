"""JSON API — recurring templates (see recurring.py for how they post). Split out of api_admin to keep files short.
Templates are validated like entries: generate() inserts their rows without further checks, so a template that
broke the From/To rules (a paycheck with only a From) would post rows that move money the wrong way."""
from __future__ import annotations
from datetime import date, timedelta
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from . import db
from .api import Con
from .api_admin import _get, _opt_int, _upsert
from .engine import Txn, validate
from .inputs import bad, body, day, far, flag, money, text, whole
from .recurring import _clamp, first_on_or_after, step

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
    """`"move": true` moves the schedule to `next_date`: its rows still ahead are posted again from that date, aiming
    for `anchor_day` when one that fits the date is sent (Undo of a move sends the old one back, so the 31st stays the
    31st). `"move": false` keeps the schedule whatever `next_date` says, so a list action built from data a moment
    old can't move it. Without the flag (older app versions) a date other than the template's own or its next one is
    a move, unless it is today or earlier: that is a date read before midnight, not a choice. The template's own date
    is past the rows already posted, so editing it to move rent from the 1st to the 3rd used to wipe December's and
    January's."""
    old = _get(con, "recurring", id)
    b = await body(request)
    f = _fields(con, b)
    today = date.today().isoformat()
    if b.get("move") is not None:
        moved = flag(b["move"], "move")
    else:
        moved = f["next_date"] > today and f["next_date"] not in (old["next_date"], _next_due(con, old, today),
                                                                  _next_slot(con, old, today))
    same_cadence = f["freq"] == old["freq"]
    if moved:
        f["anchor_day"] = _anchor(b.get("anchor_day"), date.fromisoformat(f["next_date"])) or f["anchor_day"]
    else:
        f["next_date"] = old["next_date"]
        if old["anchor_day"] and same_cadence:
            f["anchor_day"] = old["anchor_day"]  # unchanged date: keep aiming for the 31st even if next is Feb 28
    # Rows it already posted for dates still ahead are replaced: they're posted again with the new amount, category and
    # accounts (or not at all while paused). Leaving them made an edit post a second row next to an old one, and a
    # new amount only showed up after the rows already scheduled.
    # Only rows still exactly as it posted them: one you changed by hand (an amount, a note, a receipt, or moved to
    # another day) stays, and generate() won't post a second row for its date.
    same = ("recurring_id=? AND date > ? AND amount=? AND category_id=? AND from_account_id IS ? AND to_account_id IS ?"
            " AND what=? AND note='' AND tags='' AND receipt IS NULL AND split_group IS NULL"
            " AND (slot IS NULL OR slot = date)")
    args = (id, today, old["amount"], old["category_id"], old["from_account_id"],
            old["to_account_id"], old["what"] or old["label"])
    ahead = con.execute(f"SELECT date FROM transactions WHERE {same} ORDER BY date", args).fetchall()
    if ahead:
        con.execute(f"DELETE FROM transactions WHERE {same}", args)
        if not moved:  # date untouched: start again from the first one that hadn't happened
            f["next_date"] = min(ahead[0]["date"], f["next_date"])
            if not same_cadence:  # weekly to monthly: aim for the day it now starts on, not the day it was created on
                f["anchor_day"] = date.fromisoformat(f["next_date"]).day
    if moved:
        _reslot(con, id, f, today)
        if f["next_date"] < today:  # an Undo sent after midnight: carry on along the schedule, never post a backlog
            f["next_date"] = first_on_or_after(date.fromisoformat(f["next_date"]), f["freq"], f["anchor_day"],
                                               date.today()).isoformat()
    if f["active"] and not old["active"]:
        f["next_date"] = first_on_or_after(date.fromisoformat(f["next_date"]), f["freq"], f["anchor_day"],
                                           date.today()).isoformat()
    _upsert(con, "recurring", _counted(con, f), id)
    con.commit()
    return _out(con, id, today)


def _anchor(v, nxt: date) -> int | None:
    """A sent anchor day, when it fits the date: the 31st fits Sep 30 (the month is shorter), the 3rd doesn't."""
    if isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= 31 and _clamp(nxt.year, nxt.month, v) == nxt:
        return v
    return None


HALF = {"weekly": 3, "biweekly": 7}  # days: half of each short cadence's step


def _matcher(f: dict):
    """Maps a date the old schedule posted for to the new schedule's date for the same period: the same month
    (monthly) or year (yearly), the nearest date within half a step for the weekly ones. None when the new schedule has
    no date for that period (it starts after it). Nearest within half a step for monthly paired a hand-edited Nov 1
    with Oct 20 after a move to the 20th, so October went without rent and November had two."""
    start, freq, anchor = date.fromisoformat(f["next_date"]), f["freq"], f["anchor_day"]

    def match(s: date) -> date | None:
        d = start
        if freq in HALF:
            while d < s - timedelta(days=HALF[freq]):
                d = step(d, freq, anchor)
            return d if abs((d - s).days) <= HALF[freq] else None
        period = (lambda x: (x.year, x.month)) if freq == "monthly" else (lambda x: (x.year, 0))
        while period(d) < period(s):
            d = step(d, freq, anchor)
        return d if period(d) == period(s) else None
    return match


def _reslot(con, id: int, f: dict, today: str) -> None:
    """After a move, a row changed by hand (still ahead, or paid early for a date still ahead) stands for the new date
    in its period, so generate() doesn't post that date as well: moving rent from the 1st to the 3rd would otherwise
    keep the December rent you'd edited and post a second one on Dec 3. A skipped date moves with its period the same
    way, so a skipped November stays skipped. Moving back undoes both exactly."""
    match, taken = _matcher(f), set()
    kept = con.execute("SELECT id, COALESCE(slot, date) AS s FROM transactions WHERE recurring_id=? "
                       "AND (date > ? OR slot > ?) ORDER BY s", (id, today, today)).fetchall()
    for r in kept:
        d = match(date.fromisoformat(r["s"]))
        if d and d.isoformat() not in taken:
            taken.add(d.isoformat())
            con.execute("UPDATE transactions SET slot=? WHERE id=?", (d.isoformat(), r["id"]))
    skips = [x[0] for x in con.execute("SELECT date FROM recurring_skips WHERE recurring_id=? AND date > ?", (id, today))]
    moves = {s: d.isoformat() for s in skips if (d := match(date.fromisoformat(s)))}
    con.executemany("DELETE FROM recurring_skips WHERE recurring_id=? AND date=?", [(id, s) for s in moves])
    con.executemany("INSERT OR IGNORE INTO recurring_skips(recurring_id, date) VALUES(?,?)",
                    [(id, d) for d in moves.values()])


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
    con.execute("DELETE FROM recurring_skips WHERE recurring_id=?", (id,))
    con.commit()
    return {"template": template, "rows": rows}


def _ahead(con, r, today: str) -> str:
    """The first date the template itself will still post: from its own date, past today, skipped dates and dates
    that already have their row."""
    have = {x[0] for x in con.execute("SELECT date FROM recurring_skips WHERE recurring_id=? UNION "
                                      "SELECT COALESCE(slot, date) FROM transactions WHERE recurring_id=?",
                                      (r["id"], r["id"]))}
    d = date.fromisoformat(r["next_date"])
    while d.isoformat() in have or d.isoformat() <= today:
        d = step(d, r["freq"], r["anchor_day"])
    return d.isoformat()


def _next_due(con, r, today: str) -> str:
    """The date the next one happens: its earliest row still ahead, by the row's own date (October's rent moved by
    hand from the 1st to the 8th is next on the 8th; its slot said Oct 1, a past date Skip refused), or the next date
    the template will post."""
    row = con.execute("SELECT MIN(date) FROM transactions WHERE recurring_id=? AND date > ?", (r["id"], today)).fetchone()[0]
    return min(row, _ahead(con, r, today)) if row else _ahead(con, r, today)


def _next_slot(con, r, today: str) -> str:
    """Where the schedule stands: the date its next row was posted for (a row moved by hand or paid early keeps it),
    else the next date it will post. Undo of a move sends it back with the old anchor day."""
    row = con.execute("SELECT MIN(COALESCE(slot, date)) FROM transactions WHERE recurring_id=? AND (date > ? OR slot > ?)",
                      (r["id"], today, today)).fetchone()[0]
    return min(row, _ahead(con, r, today)) if row else _ahead(con, r, today)


def _out(con, id: int, today: str) -> dict:
    """A template as /admin lists it."""
    r = _get(con, "recurring", id)
    return {**r, "next_due": _next_due(con, r, today), "next_slot": _next_slot(con, r, today)}


@router.post("/recurring/{id}/skip")
async def skip_once(id: int, request: Request, con: Con):
    """Body: {"date"?: "YYYY-MM-DD"}, the next one when left out: a row's own date or the date it was posted for.
    Skips one date without touching the template: its row goes (to Recently deleted), and it isn't posted again.
    Returns the date skipped (the one the row was posted for) and the rows removed, for Undo: /transactions/restore
    with the rows, or DELETE /recurring/{id}/skip/{date} when nothing had posted yet."""
    from .entries import _remove
    b = await body(request)
    r = _get(con, "recurring", id)
    today = date.today().isoformat()
    d = day(b["date"], "Date").isoformat() if b.get("date") else _next_due(con, r, today)
    if d <= today:
        bad("Only a date still ahead can be skipped.")
    row = con.execute("SELECT id, COALESCE(slot, date) FROM transactions WHERE recurring_id=? AND date > ? "
                      "AND (date=? OR COALESCE(slot, date)=?) ORDER BY COALESCE(slot, date)=? DESC, id LIMIT 1",
                      (id, today, d, d, d)).fetchone()
    rows = []
    if row:  # _remove records the skip, for the date the row was posted for
        d, rows = row[1], _remove(con, [row[0]])
    else:
        con.execute("INSERT OR IGNORE INTO recurring_skips(recurring_id, date) VALUES(?,?)", (id, d))
    con.commit()
    return {"date": d, "rows": rows}


@router.delete("/recurring/{id}/skip/{ymd}")
def unskip(id: int, ymd: str, con: Con):
    """Takes a skip back. If the template has already moved past that date, its row is posted now."""
    r = _get(con, "recurring", id)
    d = day(ymd, "Date").isoformat()
    con.execute("DELETE FROM recurring_skips WHERE recurring_id=? AND date=?", (id, d))
    posted = con.execute("SELECT 1 FROM transactions WHERE recurring_id=? AND COALESCE(slot, date)=?", (id, d)).fetchone()
    if r["active"] and not posted and date.today().isoformat() < d < r["next_date"]:
        con.execute("INSERT INTO transactions(date,what,category_id,from_account_id,to_account_id,amount,recurring_id,"
                    "slot) VALUES(?,?,?,?,?,?,?,?)", (d, r["what"] or r["label"], r["category_id"],
                                                      r["from_account_id"], r["to_account_id"], r["amount"], id, d))
    con.commit()
    return Response(status_code=204)


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
    a = t.get("anchor_day")
    if isinstance(a, int) and not isinstance(a, bool) and 1 <= a <= 31:  # -3 made every bootstrap fail
        f["anchor_day"] = a
    _upsert(con, "recurring", {"id": id, **f}, None)
    con.commit()
    return _get(con, "recurring", id)
