"""JSON API — receipt images. Files live in data/receipts/ (mirrored by scripts/backup-x1.sh);
the transaction row stores only the file name. The client downsizes photos before upload.
Deleting an entry leaves its file for a day (so Undo can restore it); sweep() then removes files nothing uses."""
from __future__ import annotations
import os
import re
import time
import uuid
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from .api import Con

router = APIRouter(prefix="/api")
RECEIPTS = Path(os.environ.get("TALLY_RECEIPTS", "data/receipts"))
EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf"}
SAFE = re.compile(r"^[\w-]+\.[a-z0-9]{2,5}$")
MAX_BYTES = 12 * 1024 * 1024
GRACE = 24 * 3600
_swept = 0.0


def remove_receipt(name: str) -> None:
    if name and SAFE.match(name):
        try:
            (RECEIPTS / name).unlink()
        except FileNotFoundError:
            pass


def has_receipt(name: Optional[str]) -> bool:
    return bool(name and SAFE.match(name) and (RECEIPTS / name).is_file())


def orphaned(names: list[str]) -> None:
    """Mark files whose entry was just deleted: the sweep's grace period counts from now, not from the upload."""
    for name in names:
        if has_receipt(name):
            os.utime(RECEIPTS / name)


def sweep(con, grace: int = GRACE, every: int = 3600) -> int:
    """Delete receipt files no entry points at, once they've sat unused for `grace` seconds. Runs from bootstrap,
    at most once per `every` seconds per process."""
    global _swept
    now = time.time()
    if now - _swept < every or not RECEIPTS.is_dir():
        return 0
    _swept = now
    used = {r[0] for r in con.execute("SELECT receipt FROM transactions WHERE receipt IS NOT NULL")}
    n = 0
    for p in RECEIPTS.iterdir():
        if SAFE.match(p.name) and p.name not in used and p.stat().st_mtime < now - grace:
            p.unlink(missing_ok=True)
            n += 1
    return n


@router.post("/transactions/{txn_id}/receipt")
async def upload_receipt(txn_id: int, con: Con, file: UploadFile = File(...)):
    ext = EXT.get(file.content_type or "")
    if not ext:
        raise HTTPException(422, {"errors": ["Use a JPEG, PNG, WebP, HEIC or PDF."]})
    row = con.execute("SELECT receipt FROM transactions WHERE id=?", (txn_id,)).fetchone()
    if not row:
        raise HTTPException(404)
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, {"errors": ["That file is over 12 MB."]})
    RECEIPTS.mkdir(parents=True, exist_ok=True)
    name = f"{txn_id}-{uuid.uuid4().hex[:8]}.{ext}"
    (RECEIPTS / name).write_bytes(data)
    if row["receipt"]:
        remove_receipt(row["receipt"])
    con.execute("UPDATE transactions SET receipt=? WHERE id=?", (name, txn_id))
    con.commit()
    return {"receipt": name}


@router.delete("/transactions/{txn_id}/receipt", status_code=204)
def delete_receipt(txn_id: int, con: Con):
    row = con.execute("SELECT receipt FROM transactions WHERE id=?", (txn_id,)).fetchone()
    if row and row["receipt"]:
        remove_receipt(row["receipt"])
        con.execute("UPDATE transactions SET receipt=NULL WHERE id=?", (txn_id,))
        con.commit()
    return Response(status_code=204)


@router.get("/receipts/{name}")
def get_receipt(name: str):
    if not has_receipt(name):
        raise HTTPException(404)
    return FileResponse(RECEIPTS / name, headers={"Cache-Control": "private, max-age=31536000, immutable"})
