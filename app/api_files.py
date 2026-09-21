"""JSON API — receipt images. Files live in data/receipts/ (mirrored by scripts/backup-x1.sh);
the transaction row stores only the file name. The client downsizes photos before upload."""
from __future__ import annotations
import os
import re
import uuid
from pathlib import Path
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from . import db

router = APIRouter(prefix="/api")
RECEIPTS = Path(os.environ.get("TALLY_RECEIPTS", "data/receipts"))
EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf"}
SAFE = re.compile(r"^[\w-]+\.[a-z0-9]{2,5}$")
MAX_BYTES = 12 * 1024 * 1024


def remove_receipt(name: str) -> None:
    if name and SAFE.match(name):
        try:
            (RECEIPTS / name).unlink()
        except FileNotFoundError:
            pass


@router.post("/transactions/{txn_id}/receipt")
async def upload_receipt(txn_id: int, file: UploadFile = File(...)):
    ext = EXT.get(file.content_type or "")
    if not ext:
        raise HTTPException(422, {"errors": ["Use a JPEG, PNG, WebP, HEIC or PDF."]})
    con = db.connect()
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
def delete_receipt(txn_id: int):
    con = db.connect()
    row = con.execute("SELECT receipt FROM transactions WHERE id=?", (txn_id,)).fetchone()
    if row and row["receipt"]:
        remove_receipt(row["receipt"])
        con.execute("UPDATE transactions SET receipt=NULL WHERE id=?", (txn_id,))
        con.commit()
    return Response(status_code=204)


@router.get("/receipts/{name}")
def get_receipt(name: str):
    if not SAFE.match(name) or not (RECEIPTS / name).is_file():
        raise HTTPException(404)
    return FileResponse(RECEIPTS / name, headers={"Cache-Control": "private, max-age=31536000, immutable"})
