"""JSON API for bank sync (bank.py, plaid.py). Every route answers 404 unless Plaid keys are configured, so a server
without them (the real Tally, for now) looks exactly as it did. Same conventions as api.py: cents on the wire,
dollars in request bodies."""
from __future__ import annotations
import sqlite3
from datetime import date
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from . import bank, plaid, service
from .api import Con
from .engine import Txn
from .entries import _full, _write
from .inputs import bad, body, day, money, opt_id, text, whole


def _on():
    if not plaid.enabled():
        raise HTTPException(404)


router = APIRouter(prefix="/api/bank", dependencies=[Depends(_on)])
Bank = Annotated[sqlite3.Connection, Depends(bank.session)]


def _plaid(fn, *a):
    """Plaid's refusals come back as 424, not 502: the app treats 502 and up as "Tally unreachable" and would queue or
    retry instead of showing Plaid's message."""
    try:
        return fn(*a)
    except plaid.PlaidError as e:
        raise HTTPException(424, {"errors": [e.message], "code": e.code})


@router.get("")
def status(b: Bank, con: Con):
    items = []
    for it in b.execute("SELECT id, institution, error, synced_at, created_at FROM items ORDER BY id"):
        accts = [dict(a) for a in b.execute(
            "SELECT id, name, official_name, mask, type, subtype, tally_account_id, current, available, balance_at"
            " FROM accounts WHERE item_id=? ORDER BY id", (it["id"],))]
        items.append({**dict(it), "accounts": accts})
    mapped = bank._mapped(b, service.load(con))
    new = sum(1 for r in b.execute("SELECT account_id FROM txns WHERE status='new' AND pending=0")
              if r[0] in mapped)
    return {"env": plaid.env(), "items": items, "waiting": new}


@router.post("/link-token")
async def link_token(request: Request, b: Bank):
    """Body: {"item_id"?: id} to repair that connection in place instead of adding one."""
    raw = await body(request)
    token = None
    if (iid := opt_id(raw.get("item_id"), "Connection")) is not None:
        row = b.execute("SELECT access_token FROM items WHERE id=?", (iid,)).fetchone()
        if not row:
            raise HTTPException(404)
        token = row[0]
    return {"link_token": _plaid(plaid.link_token, token)}


def _refresh(b, con) -> dict:
    counts = bank.sync_all(b)
    st = service.load(con)
    return {"synced": counts, "paired": bank.link(b, st)}


@router.post("/connect", status_code=201)
async def connect(request: Request, b: Bank, con: Con):
    """Body: {"public_token": from Plaid Link}. Stores the connection, then pulls its history."""
    raw = await body(request)
    pt = text(raw.get("public_token"), "Public token", 200)
    if not pt:
        bad("Missing public_token.")
    access, item_id = _plaid(plaid.exchange, pt)
    iid = _plaid(bank.add_item, b, access, item_id)
    return {"item_id": iid, **_refresh(b, con)}


@router.delete("/items/{iid}", status_code=204)
def disconnect(iid: int, b: Bank):
    row = b.execute("SELECT access_token FROM items WHERE id=?", (iid,)).fetchone()
    if not row:
        raise HTTPException(404)
    try:
        plaid.remove(row[0])
    except plaid.PlaidError as e:
        if e.code not in ("ITEM_NOT_FOUND", "INVALID_ACCESS_TOKEN"):
            raise HTTPException(424, {"errors": [e.message], "code": e.code})
    b.execute("DELETE FROM items WHERE id=?", (iid,))
    b.commit()


@router.put("/accounts/{aid}")
async def map_account(aid: int, request: Request, b: Bank, con: Con):
    """Body: {"tally_account_id": id or null}: which ledger account this bank account is."""
    raw = await body(request)
    target = opt_id(raw.get("tally_account_id"), "Account")
    st = service.load(con)
    if target is not None and target not in st.acct:
        bad("Unknown account.")
    if target is not None and b.execute("SELECT 1 FROM accounts WHERE tally_account_id=? AND id!=?",
                                        (target, aid)).fetchone():
        bad(f"Another bank account is already {st.acct[target].name}.")
    if not b.execute("UPDATE accounts SET tally_account_id=? WHERE id=?", (target, aid)).rowcount:
        raise HTTPException(404)
    b.commit()
    return {"paired": bank.link(b, st)}


@router.post("/sync")
def sync(b: Bank, con: Con):
    return _refresh(b, con)


@router.get("/inbox")
def inbox(b: Bank, con: Con):
    st = service.load(con)
    bank.link(b, st)
    return bank.inbox(b, st)


def _bank_row(b, bid: int):
    r = b.execute("SELECT * FROM txns WHERE id=?", (bid,)).fetchone()
    if not r:
        raise HTTPException(404)
    if r["status"] != "new":
        raise HTTPException(409, {"errors": ["That one is already done."]})
    if r["pending"]:
        bad("It's still pending at the bank; it can change until it posts.")
    return r


def _accept(b, st, r, over: dict) -> int:
    """Write the entry a bank row stands for: the guess, with anything the body sends instead."""
    g = bank.guess(b, st, r)
    cat = whole(over["category_id"], "Category") if over.get("category_id") not in (None, "") else g.category_id
    if cat is None:
        bad("Pick a category.")
    if "from_id" in over or "to_id" in over or cat != g.category_id:
        acct = bank._mapped(b, st).get(r["account_id"])
        f, t, amt = bank.shape(st, cat, acct, None, r["amount"])
        f = opt_id(over["from_id"], "From") if "from_id" in over else f
        t = opt_id(over["to_id"], "To") if "to_id" in over else t
    else:
        f, t, amt = g.from_id, g.to_id, g.amount
    if "amount" in over:
        amt = money(over["amount"])
    when = day(over["date"]) if over.get("date") else date.fromisoformat(r["authorized_date"] or r["date"])
    what = text(over["what"], "Description") if "what" in over else g.what
    meta = {"note": text(over.get("note"), "Note", 2000)}
    return _write(st, Txn(None, when, what, cat, f, t, amt), meta)


@router.post("/inbox/{bid}/accept", status_code=201)
async def accept(bid: int, request: Request, b: Bank, con: Con):
    """Body (all optional): what, category_id, from_id, to_id, amount (dollars), date, note."""
    over = await body(request)
    r = _bank_row(b, bid)
    st = service.load(con)
    tid = _accept(b, st, r, over)
    con.commit()
    bank.decide(b, bid, tid, "added")
    b.commit()
    bank.link(b, service.load(con))  # the other side of a transfer pairs with the same entry
    return _full(con, [tid])[0]


@router.post("/inbox/accept-sure")
def accept_sure(b: Bank, con: Con):
    """Add every posted row whose guess is "sure", each as its own entry. Returns the new entries."""
    st = service.load(con)
    done = []
    for item in bank.inbox(b, st):
        if item["guess"] and item["guess"]["confidence"] == "sure":
            r = b.execute("SELECT * FROM txns WHERE id=?", (item["id"],)).fetchone()
            if r["status"] != "new":
                continue  # paired with an entry added earlier in this loop
            tid = _accept(b, st, r, {})
            con.commit()
            bank.decide(b, r["id"], tid, "added")
            b.commit()
            st = service.load(con)
            bank.link(b, st)
            done.append(tid)
    return _full(con, done) if done else []


@router.post("/inbox/{bid}/pair")
async def pair(bid: int, request: Request, b: Bank, con: Con):
    """Body: {"txn_id": id}: this bank row is that entry, already in Tally."""
    raw = await body(request)
    tid = whole(raw.get("txn_id"), "Entry")
    _bank_row(b, bid)
    if not con.execute("SELECT 1 FROM transactions WHERE id=?", (tid,)).fetchone():
        raise HTTPException(404)
    bank.decide(b, bid, tid, "manual")
    b.commit()
    return {"ok": True}


@router.post("/inbox/{bid}/ignore")
def ignore(bid: int, b: Bank):
    r = b.execute("SELECT status FROM txns WHERE id=?", (bid,)).fetchone()
    if not r:
        raise HTTPException(404)
    bank.decide(b, bid, None, "ignored")
    b.commit()
    return {"ok": True}


@router.post("/txns/{bid}/reset")
def reset(bid: int, b: Bank):
    """Undo a pairing or an ignore. The entry itself stays; delete it in Tally if it shouldn't be there."""
    if not b.execute("UPDATE txns SET status='new', txn_id=NULL, how=NULL, decided_at=NULL WHERE id=?",
                     (bid,)).rowcount:
        raise HTTPException(404)
    b.commit()
    return {"ok": True}


@router.get("/audit/{aid}")
def audit(aid: int, b: Bank, con: Con):
    st = service.load(con)
    bank.link(b, st)
    r = bank.audit(b, st, aid)
    if "error" in r:
        bad(r["error"])
    return r


@router.post("/sandbox/connect", status_code=201)
def sandbox_connect(b: Bank, con: Con, institution: Optional[str] = None):
    """Sandbox only: connect a made-up test bank without the phone, for trying the flow end to end."""
    if plaid.env() != "sandbox":
        raise HTTPException(404)
    pt = _plaid(plaid.sandbox_item, *([institution] if institution else []))
    access, item_id = _plaid(plaid.exchange, pt)
    iid = _plaid(bank.add_item, b, access, item_id)
    return {"item_id": iid, **_refresh(b, con)}
