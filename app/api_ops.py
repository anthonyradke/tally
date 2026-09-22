"""JSON API — reconcile and month-end. Moved out of api.py to keep files short; same conventions."""
from __future__ import annotations
import os
from datetime import date, datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from . import db, service
from .api import Con, _txn
from .engine import Txn, cents, month_end as eom

router = APIRouter(prefix="/api")


@router.post("/reconcile/{account_id}")
async def reconcile(account_id: int, request: Request, con: Con):
    """Body: {"actual": dollars, "save": bool}. Compares rows dated on or before today."""
    st = service.load(con)
    b = await request.json()
    a = st.acct.get(account_id)
    if not a:
        raise HTTPException(404)
    d = st.diagnose(a, cents(b.get("actual") or 0))
    if b.get("save"):
        st.con.execute("INSERT INTO reconciliations(account_id,date,actual,expected) VALUES(?,?,?,?)",
                       (a.id, st.today.isoformat(), d.actual, d.expected))
        st.con.commit()
    return {"expected": d.expected, "actual": d.actual, "gap": d.gap, "saved": bool(b.get("save")),
            "doubled": [_txn(t) for t in d.doubled], "single": [_txn(t) for t in d.single],
            "future": [_txn(t) for t in d.future]}


@router.get("/reconciliations")
def reconciliations(con: Con, limit: int = 50):
    return [dict(r) for r in con.execute(
        "SELECT * FROM reconciliations ORDER BY date DESC, id DESC LIMIT ?", (limit,))]


@router.get("/month-end/{ym}")
def month_end(ym: str, con: Con):
    st = service.load(con)
    m = date.fromisoformat(ym + "-01")
    s = st.month_end_status(m)
    return {"month": m.isoformat(), "typed": s["typed"], "recon": s["recon"],
            "interest": {aid: {"logged": [_txn(t) for t in v["logged"]], "proposed": v["proposed"]}
                         for aid, v in s["interest"].items()},
            "typed_done": s["typed_done"], "interest_done": s["interest_done"], "recon_done": s["recon_done"]}


@router.post("/month-end/{ym}/typed")
async def month_end_typed(ym: str, request: Request, con: Con):
    """Body: {"<account_id>": dollars, ...}"""
    m = date.fromisoformat(ym + "-01")
    for k, v in (await request.json()).items():
        if v not in (None, ""):
            db.set_typed(con, int(k), m, cents(v))
    con.commit()
    return {"ok": True}


@router.post("/month-end/{ym}/interest")
async def month_end_interest(ym: str, request: Request, con: Con):
    """Body: {"<account_id>": dollars, ...} — logs an interest income row (Settings' interest_category) dated the last day of the month."""
    st = service.load(con)
    m = date.fromisoformat(ym + "-01")
    income = st.category_for("interest_category", "Other Income")
    if income is None:
        raise HTTPException(422, {"errors": ["Pick an interest income category in Settings, General first."]})
    for k, v in (await request.json()).items():
        if v not in (None, "") and cents(v):
            aid = int(k)
            if aid not in st.acct:
                raise HTTPException(404)
            db.insert_txn(st.con, Txn(None, eom(m), f"{st.acct[aid].name} interest", income, None, aid, cents(v)))
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
