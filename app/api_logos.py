"""Logos (logos.py): GET /api/logo?name=… for an entry's name, ?account=… for a ledger account's bank. The image, or
404 when there's none to show (the app then draws the name's first letter). DELETE hides a wrong one for good."""
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from . import bank, logos
from .api import Con

router = APIRouter(prefix="/api/logo")
CACHE = {"Cache-Control": "private, max-age=604800"}


def _bank_sources(con, name: str) -> list[tuple[str, str]]:
    """Plaid's logo or website for this merchant: rows the bank named the same, or rows paired with entries of
    this name."""
    try:
        b = bank.connect()
    except Exception:
        return []
    try:
        key = logos.norm(name)
        ids = [r[0] for r in con.execute("SELECT id FROM transactions WHERE lower(what)=lower(?) LIMIT 50", (name,))]
        marks = ",".join("?" * len(ids))
        rows = b.execute(
            "SELECT logo, website FROM txns WHERE (logo IS NOT NULL OR website IS NOT NULL) AND (lower(merchant)=? OR "
            f"lower(counterparty)=?{f' OR txn_id IN ({marks})' if ids else ''}) ORDER BY logo IS NULL LIMIT 5",
            [key, key, *ids]).fetchall()
    finally:
        b.close()
    out: list[tuple[str, str]] = []
    for r in rows:
        if r["logo"]:
            out.append(("url", r["logo"]))
        if d := logos.domain_of(r["website"]):
            out.append(("domain", d))
    return out


def _account_sources(con, aid: int) -> list[tuple[str, str]]:
    a = con.execute("SELECT name, bank, icon FROM accounts WHERE id=?", (aid,)).fetchone()
    if not a:
        raise HTTPException(404)
    out: list[tuple[str, str]] = []
    try:
        b = bank.connect()
        try:
            it = b.execute("SELECT i.website, i.logo FROM accounts x JOIN items i ON i.id=x.item_id "
                           "WHERE x.tally_account_id=? LIMIT 1", (aid,)).fetchone()
        finally:
            b.close()
        if it and (d := logos.domain_of(it["website"])):
            out.append(("domain", d))
        if it and it["logo"]:
            out.append(("base64", it["logo"]))
    except Exception:
        pass
    hint = (a["icon"] or "").removeprefix("logo:") if (a["icon"] or "").startswith("logo:") else None
    for n in (hint, a["bank"]):
        out += [("domain", d) for d in logos.domains_for(n or "")][:1]
    return out


def _item_sources(iid: int) -> list[tuple[str, str]]:
    """A connected bank: Plaid's record of its website and logo, then its name."""
    b = bank.connect()
    try:
        it = b.execute("SELECT institution, website, logo FROM items WHERE id=?", (iid,)).fetchone()
    finally:
        b.close()
    if not it:
        raise HTTPException(404)
    out: list[tuple[str, str]] = []
    if d := logos.domain_of(it["website"]):
        out.append(("domain", d))
    if it["logo"]:
        out.append(("base64", it["logo"]))
    return out + [("domain", d) for d in logos.domains_for(it["institution"] or "")][:1]


def _ident(name: Optional[str], account: Optional[int], item: Optional[int] = None) -> tuple[str, str]:
    if item is not None:
        return "item", str(item)
    if account is not None:
        return "account", str(account)
    key = logos.norm(name or "")
    if not key:
        raise HTTPException(404)
    return "name", key


@router.get("")
def get_logo(con: Con, name: Optional[str] = None, account: Optional[int] = None, item: Optional[int] = None):
    """`item`: a connected bank (setup lists them before any account exists)."""
    kind, ident = _ident(name, account, item)
    sources = _item_sources(item) if item is not None else _account_sources(con, account) if account is not None else \
        _bank_sources(con, name or "") + [("domain", d) for d in logos.domains_for(name or "")]
    path = logos.resolve(kind, ident, sources)
    if not path:
        raise HTTPException(404)
    return FileResponse(path, media_type="image/png", headers=CACHE)


@router.delete("", status_code=204)
def hide_logo(name: Optional[str] = None, account: Optional[int] = None):
    logos.hide(*_ident(name, account))


@router.post("/show", status_code=204)
def show_logo(name: Optional[str] = None, account: Optional[int] = None):
    """Undo for hide."""
    logos.unhide(*_ident(name, account))

