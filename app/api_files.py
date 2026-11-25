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
HEIF_BRANDS = {b"heic", b"heix", b"heim", b"heis", b"hevc", b"hevx", b"hevm", b"hevs", b"mif1", b"msf1"}


def sniff(data: bytes) -> Optional[str]:
    """The file's real type from its first bytes, or None for anything that isn't one of the allowed types."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[4:8] == b"ftyp" and data[8:12] in HEIF_BRANDS:  # ISO media box; the major brand says HEIF, not video
        return "image/heic"
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    return None


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
    used |= {r[0] for r in con.execute("SELECT value FROM settings WHERE key LIKE 'card_art:%'") if r[0]}  # card pictures
    # Entries in Recently deleted keep their file until they're purged, so restoring one brings its receipt back.
    used |= {r[0] for r in con.execute("SELECT json_extract(row, '$.receipt') FROM deleted") if r[0]}
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
    data = await file.read(MAX_BYTES + 1)  # no more than the cap into memory
    if len(data) > MAX_BYTES:
        raise HTTPException(413, {"errors": ["That file is over 12 MB."]})
    # The declared type picks the extension the file is later served as, so the bytes must agree with it.
    if sniff(data) != file.content_type:
        raise HTTPException(422, {"errors": ["That file isn't the image or PDF it says it is."]})
    RECEIPTS.mkdir(parents=True, exist_ok=True)
    name = f"{txn_id}-{uuid.uuid4().hex[:8]}.{ext}"
    (RECEIPTS / name).write_bytes(data)
    con.execute("UPDATE transactions SET receipt=? WHERE id=?", (name, txn_id))
    con.commit()
    if row["receipt"]:  # only once the row points at the new file
        remove_receipt(row["receipt"])
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
    # The type comes from the file's extension, which the upload picked from its declared type once the bytes
    # matched it; nosniff keeps a
    # browser from reading a file labelled as an image as anything else.
    return FileResponse(RECEIPTS / name, headers={"Cache-Control": "private, max-age=31536000, immutable",
                                                  "X-Content-Type-Options": "nosniff"})


# ---------- card art: a picture of the real card, for an account's card on Accounts ----------
ART = ("image/jpeg", "image/png", "image/webp", "image/heic")


def _art_name(con, aid: int) -> Optional[str]:
    row = con.execute("SELECT value FROM settings WHERE key=?", (f"card_art:{aid}",)).fetchone()
    name = row[0] if row else None
    return name if name and SAFE.match(name) and (RECEIPTS / name).is_file() else None


@router.put("/accounts/{aid}/art")
async def upload_art(aid: int, con: Con, file: UploadFile = File(...)):
    """A photo or image of the account's card, shown as its card on Accounts. Kept with the receipts."""
    from .db import set_setting
    if not con.execute("SELECT 1 FROM accounts WHERE id=?", (aid,)).fetchone():
        raise HTTPException(404)
    if file.content_type not in ART:
        raise HTTPException(422, {"errors": ["Use a JPEG, PNG, WebP or HEIC image."]})
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, {"errors": ["That image is over 12 MB."]})
    if sniff(data) != file.content_type:
        raise HTTPException(422, {"errors": ["That file isn't the image it says it is."]})
    old = _art_name(con, aid)
    RECEIPTS.mkdir(parents=True, exist_ok=True)
    name = f"card-{uuid.uuid4().hex[:12]}.{EXT[file.content_type]}"
    (RECEIPTS / name).write_bytes(data)
    set_setting(con, f"card_art:{aid}", name)
    con.commit()
    if old:
        remove_receipt(old)
    return {"art": name}


@router.delete("/accounts/{aid}/art", status_code=204)
def delete_art(aid: int, con: Con):
    from .db import set_setting
    if old := _art_name(con, aid):
        remove_receipt(old)
    set_setting(con, f"card_art:{aid}", "")
    con.commit()
    return Response(status_code=204)
