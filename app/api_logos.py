"""Logos (logos.py): GET /api/logo?name=… for an entry's name, ?account=… for a ledger account's bank. The image, or
404 when there's none to show (the app then draws the name's first letter). DELETE hides a wrong one for good."""
from __future__ import annotations
import re
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


def _plaid_item(b_query: str, arg) -> Optional[str]:
    try:
        b = bank.connect()
    except Exception:
        return None
    try:
        r = b.execute(b_query, (arg,)).fetchone()
        return r[0] if r else None
    finally:
        b.close()


def _ident(con, name: Optional[str], account: Optional[int], item: Optional[int] = None) -> tuple[str, str]:
    """What a logo is saved under. Never a bare row id: a fresh ledger or bank database numbers from 1 again, and
    account 1 would show the old account 1's bank. A connected bank goes by Plaid's id for it; a ledger account by
    its id with its bank's name and connection."""
    if item is not None:
        pid = _plaid_item("SELECT item_id FROM items WHERE id=?", item)
        if not pid:
            raise HTTPException(404)
        return "item", pid
    if account is not None:
        a = con.execute("SELECT name, bank FROM accounts WHERE id=?", (account,)).fetchone()
        if not a:
            raise HTTPException(404)
        pid = _plaid_item("SELECT i.item_id FROM accounts x JOIN items i ON i.id=x.item_id WHERE x.tally_account_id=?",
                          account) or ""
        return "account", f"{account}|{a['bank'] or ''}|{a['name']}|{pid}"
    key = logos.norm(name or "")
    if not key:
        raise HTTPException(404)
    return "name", key


def _sources(con, name: Optional[str], account: Optional[int], item: Optional[int]):
    """Where to look, as a function: logos.resolve only calls it when the cache has no answer, so a cached logo no
    longer reads the bank's tables first."""
    if item is not None:
        return lambda: _item_sources(item)
    if account is not None:
        return lambda: _account_sources(con, account)
    return lambda: _bank_sources(con, name or "") + [("domain", d) for d in logos.domains_for(name or "")]


@router.get("")
def get_logo(con: Con, name: Optional[str] = None, account: Optional[int] = None, item: Optional[int] = None):
    """`item`: a connected bank (setup lists them before any account exists)."""
    kind, ident = _ident(con, name, account, item)
    path = logos.resolve(kind, ident, _sources(con, name, account, item))
    if not path:
        raise HTTPException(404)
    return FileResponse(path, media_type="image/png", headers=CACHE)


@router.get("/color")
def get_color(con: Con, name: Optional[str] = None, account: Optional[int] = None, item: Optional[int] = None):
    """The brand's color as #RRGGBB, or null: Plaid's color for a bank where it has one, else the logo's own."""
    kind, ident = _ident(con, name, account, item)
    plaid_color = None
    if item is not None:
        plaid_color = _plaid_item("SELECT color FROM items WHERE id=?", item)
    elif account is not None:
        plaid_color = _plaid_item("SELECT i.color FROM accounts x JOIN items i ON i.id=x.item_id WHERE x.tally_account_id=?",
                                  account)
    if plaid_color and re.fullmatch(r"#?[0-9a-fA-F]{6}", plaid_color):
        return {"color": "#" + plaid_color.lstrip("#").upper()}
    path = logos.resolve(kind, ident, _sources(con, name, account, item))
    return {"color": logos.color_of(kind, ident, path) if path else None}


@router.delete("", status_code=204)
def hide_logo(con: Con, name: Optional[str] = None, account: Optional[int] = None):
    logos.hide(*_ident(con, name, account))


@router.post("/show", status_code=204)
def show_logo(con: Con, name: Optional[str] = None, account: Optional[int] = None):
    """Undo for hide."""
    logos.unhide(*_ident(con, name, account))



cards = APIRouter(prefix="/api/cards")


@cards.get("")
def card_faces(con: Con):
    """What each account's card on Accounts shows besides the ledger's own fields: the picture of the real card if
    one was added, and from the bank its last four digits, the bank's name and its brand color."""
    out: dict[str, dict] = {}
    linked: dict[int, dict] = {}
    try:
        b = bank.connect()
        try:
            for r in b.execute("SELECT x.tally_account_id, x.mask, x.subtype, i.institution, i.color FROM accounts x "
                               "JOIN items i ON i.id=x.item_id WHERE x.tally_account_id IS NOT NULL"):
                linked[r[0]] = {"mask": r[1], "subtype": r[2], "institution": r[3], "color": r[4]}
        finally:
            b.close()
    except Exception:
        pass
    art = {int(k.split(":", 1)[1]): v for k, v in con.execute("SELECT key, value FROM settings WHERE key LIKE 'card_art:%'") if v}
    for (aid,) in con.execute("SELECT id FROM accounts"):
        x = linked.get(aid, {})
        color = x.get("color")
        out[str(aid)] = {"art": art.get(aid), "mask": x.get("mask"), "subtype": x.get("subtype"),
                         "institution": x.get("institution"),
                         "color": "#" + color.lstrip("#").upper() if color and re.fullmatch(r"#?[0-9a-fA-F]{6}", color) else None}
    return out
