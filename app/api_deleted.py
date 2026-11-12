"""JSON API — Recently deleted. Every deleted entry (one, a bulk delete, a recurring template's rows ahead) is kept
here as it was for 30 days, so it can be put back after its Undo toast has gone, or after the app was closed. Putting
one back goes through /api/transactions/restore with the row, which also takes it off this list."""
from __future__ import annotations
import json
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter
from fastapi.responses import Response
from .api import Con

router = APIRouter(prefix="/api")
KEEP_DAYS = 30


def purge(con, days: int = KEEP_DAYS) -> int:
    """Forget entries deleted more than `days` ago (their receipt files go with the next sweep). Runs from bootstrap."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(timespec="seconds")
    if not con.execute("SELECT 1 FROM deleted WHERE deleted_at < ? LIMIT 1", (cutoff,)).fetchone():
        return 0  # a DELETE that matched nothing still took the write lock until the request ended
    n = con.execute("DELETE FROM deleted WHERE deleted_at < ?", (cutoff,)).rowcount
    con.commit()
    return n


@router.get("/deleted")
def recently_deleted(con: Con):
    """Newest first: each entry as it was, with `deleted_at` (UTC). Rows whose id is in use again (put back by an
    Undo that didn't reach this list, say) are left out."""
    live = {r[0] for r in con.execute("SELECT id FROM transactions")}
    rows = con.execute("SELECT * FROM deleted ORDER BY deleted_at DESC, txn_id DESC").fetchall()
    out = []
    for r in rows:
        if r["txn_id"] not in live:
            row = json.loads(r["row"])
            row.pop("slot", None)  # server-side only: restore reads it from here
            out.append({**row, "deleted_at": r["deleted_at"]})
    return out


@router.delete("/deleted/{txn_id}", status_code=204)
def forget(txn_id: int, con: Con):
    con.execute("DELETE FROM deleted WHERE txn_id=?", (txn_id,))
    con.commit()
    return Response(status_code=204)


@router.delete("/deleted", status_code=204)
def empty(con: Con):
    con.execute("DELETE FROM deleted")
    con.commit()
    return Response(status_code=204)
