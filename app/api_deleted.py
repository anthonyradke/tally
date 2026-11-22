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
    """Newest first: each entry as it was, with `deleted_at` (UTC) and `batch`, shared by the rows one delete removed
    (a bulk delete, a split; null for rows deleted before it was kept), which come next to each other. Rows whose id
    is in use again (put back by an Undo that didn't reach this list, say) are left out.
    `skipped_from` is the template's label for a scheduled row taken out before its day (Skip, or a delete of one),
    whose date the template now skips: putting it back posts it again. Null for every other row, including the rows
    a template's delete took with it (their skips went with the template)."""
    live = {r[0] for r in con.execute("SELECT id FROM transactions")}
    skips = {(r[0], r[1]): r[2] for r in con.execute(
        "SELECT s.recurring_id, s.date, r.label FROM recurring_skips s JOIN recurring r ON r.id = s.recurring_id")}
    rows = con.execute("SELECT * FROM deleted ORDER BY deleted_at DESC, json_extract(row, '$.batch') DESC, "
                       "txn_id DESC").fetchall()
    out = []
    for r in rows:
        if r["txn_id"] not in live:
            row = json.loads(r["row"])
            slot = row.pop("slot", None)  # server-side only: restore reads it from here
            rid = row.get("recurring_id")
            skipped = skips.get((rid, slot or row.get("date"))) if rid else None
            out.append({**row, "batch": row.get("batch"), "deleted_at": r["deleted_at"], "skipped_from": skipped})
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
