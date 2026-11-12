"""JSON API — reconcile and month-end. Moved out of api.py to keep files short; same conventions."""
from __future__ import annotations
import os
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from . import db, service
from .api import Con, _txn
from .engine import Txn, month_end as eom, validate
from .inputs import bad, body, money, month as parse_month, whole

router = APIRouter(prefix="/api")


@router.post("/reconcile/{account_id}")
async def reconcile(account_id: int, request: Request, con: Con):
    """Body: {"actual": dollars, "save": bool}. Compares rows dated on or before today."""
    b = await body(request)
    st = service.load(con)
    a = st.acct.get(account_id)
    if not a:
        raise HTTPException(404)
    d = st.diagnose(a, money(b.get("actual") or 0, "Balance"))
    if b.get("save"):
        st.con.execute("INSERT INTO reconciliations(account_id,date,actual,expected) VALUES(?,?,?,?)",
                       (a.id, st.today.isoformat(), d.actual, d.expected))
        st.con.commit()
    return {"expected": d.expected, "actual": d.actual, "gap": d.gap, "saved": bool(b.get("save")),
            "doubled": [_txn(t) for t in d.doubled], "single": [_txn(t) for t in d.single],
            "future": [_txn(t) for t in d.future]}


@router.get("/reconciliations")
def reconciliations(con: Con, limit: int = 50):
    limit = max(0, min(limit, 1000))
    return [dict(r) for r in con.execute(
        "SELECT * FROM reconciliations ORDER BY date DESC, id DESC LIMIT ?", (limit,))]


def _ledger_month(st, ym: str):
    """A month the ledger has. A balance typed for 9999-12 stretched the month table to year 10000, and from then on
    every screen failed; a month outside the ledger also had no row for month_end_status to read."""
    m = parse_month(ym)
    if m not in st.months:
        raise HTTPException(404, {"errors": ["Tally has no such month."]})
    return m


@router.get("/month-end/{ym}")
def month_end(ym: str, con: Con):
    st = service.load(con)
    m = _ledger_month(st, ym)
    s = st.month_end_status(m)
    return {"month": m.isoformat(), "typed": s["typed"], "loans": s["loans"], "recon": s["recon"],
            "interest": {aid: {"logged": [_txn(t) for t in v["logged"]], "proposed": v["proposed"]}
                         for aid, v in s["interest"].items()},
            "typed_done": s["typed_done"], "interest_done": s["interest_done"], "recon_done": s["recon_done"]}


@router.post("/month-end/{ym}/typed")
async def month_end_typed(ym: str, request: Request, con: Con):
    """Body: {"<account_id>": dollars | null, ...}. Investments and loans: the balance at the end of the month. null
    takes a typed balance back out (a loan goes back to working itself out); "" leaves it as it is."""
    b = await body(request)
    m = _ledger_month(service.load(con), ym)
    known = {r[0] for r in con.execute("SELECT id FROM accounts WHERE kind IN ('investment','loan')")}
    for k, v in b.items():
        if v == "":
            continue
        aid = whole(k, "Account")
        if aid not in known:
            raise HTTPException(404)
        if v is None:
            con.execute("DELETE FROM typed_balances WHERE account_id=? AND month=?", (aid, m.isoformat()))
        else:
            db.set_typed(con, aid, m, money(v, "Balance"))
    con.commit()
    return {"ok": True}


@router.post("/month-end/{ym}/interest")
async def month_end_interest(ym: str, request: Request, con: Con):
    """Body: {"<account_id>": dollars, ...} — logs an interest income row (Settings' interest_category) dated the last
    day of the month, once per account and month."""
    # The body is read first: nothing awaits between the "already logged" check and the insert, so two requests at
    # once can't both see it as not logged yet.
    b = await body(request)
    st = service.load(con)
    m = _ledger_month(st, ym)
    income = st.category_for("interest_category", "Other Income")
    if income is None:
        raise HTTPException(422, {"errors": ["Pick an interest income category in Settings, General first."]})
    logged = {aid for aid, x in st.month_end_status(m)["interest"].items() if x["logged"]}
    for k, v in b.items():
        if v not in (None, "") and (amount := money(v, "Interest")):
            aid = whole(k, "Account")
            if aid not in st.acct:
                raise HTTPException(404)
            if aid in logged:
                continue  # already logged for the month: a second tap (or a retry) used to log it twice
            t = Txn(None, eom(m), f"{st.acct[aid].name} interest", income, None, aid, amount)
            if errs := validate(t, st.cat[income].type, st.acct):
                bad(f"The interest category is set up as {st.cat[income].type}. {errs[0]}")
            db.insert_txn(st.con, t)
    st.con.commit()
    return {"ok": True}


@router.get("/backups")
def backups():
    """The nightly snapshots written by scripts/backup-x1.sh (tally-YYYY-MM-DD.db), newest first. Named snapshots
    (tally-pre-*.db) are left out: they're taken by hand and say nothing about the cron job."""
    folder = Path(os.environ.get("TALLY_BACKUPS", Path.home() / "backups" / "tally"))
    files = sorted(folder.glob("tally-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].db"), reverse=True) \
        if folder.is_dir() else []
    if not files:
        return {"latest": None, "count": 0, "folder": str(folder)}
    st = files[0].stat()
    return {"latest": {"name": files[0].name, "size": st.st_size,
                       "at": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat()},
            "count": len(files), "folder": str(folder)}
