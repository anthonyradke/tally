"""JSON API for bank sync (bank.py, plaid.py). Every route answers 404 unless Plaid keys are configured, so a server
without them (the real Tally, for now) looks exactly as it did. Same conventions as api.py: cents on the wire,
dollars in request bodies."""
from __future__ import annotations
import asyncio, hmac, json, logging, os, sqlite3, threading
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from . import bank, db, plaid, service
from .api import Con
from .engine import Txn, month_of
from .entries import _full, _write
from .inputs import bad, body, day, money, opt_id, text, whole


log = logging.getLogger(__name__)


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
    return {"env": plaid.env(), "items": items, "waiting": bank.waiting(b, service.load(con)), "ask": bank.ask(b),
            "auto": _auto(con)}


@router.post("/link-token")
async def link_token(request: Request, b: Bank):
    """Body: {"item_id"?: id} to repair that connection in place instead of adding one. A new connection's token lets
    one session add several banks where Plaid allows it (`multi`); the phone then hands the token back to /connect."""
    raw = await body(request)
    token = None
    if (iid := opt_id(raw.get("item_id"), "Connection")) is not None:
        row = b.execute("SELECT access_token FROM items WHERE id=?", (iid,)).fetchone()
        if not row:
            raise HTTPException(404)
        token = row[0]
    user = None if token else await asyncio.to_thread(bank.plaid_user, b)
    try:
        lt = plaid.link_token(token, user)
    except plaid.PlaidError as e:
        if not user:
            raise HTTPException(424, {"errors": [e.message], "code": e.code})
        user, lt = None, _plaid(plaid.link_token, token)  # Multi-Item Link refused: one bank per session
    return {"link_token": lt, "multi": bool(user)}


def _auto(con) -> bool:
    """Whether this ledger adds the rows it's sure about by itself (one set up from the banks)."""
    row = con.execute("SELECT value FROM settings WHERE key='bank_auto'").fetchone()
    return bool(row and row[0] == "1")


def auto_add(b, con, passes: int = 2) -> int:
    """Add every waiting row that `bank.auto_ok` passes, as its own entry. One side of a move between your own
    accounts is added; the other pairs with it afterwards. A second pass picks up merchants the first one taught.
    Returns how many entries were added."""
    added = 0
    for _ in range(passes):
        st = service.load(con)
        bank.link(b, st)
        skip: set[int] = set()
        n = 0
        for item in bank.inbox(b, st):
            if not item["guess"] or item["id"] in skip:
                continue
            r = b.execute("SELECT * FROM txns WHERE id=?", (item["id"],)).fetchone()
            g = bank.Guess(**item["guess"])
            if r["status"] != "new" or not bank.auto_ok(g, r):
                continue
            try:
                tid = _write(st, Txn(None, date.fromisoformat(r["authorized_date"] or r["date"]), g.what,
                                     g.category_id, g.from_id, g.to_id, g.amount), {})
            except HTTPException:
                continue  # doesn't fit (a date before the ledger starts, a shape the category refuses): it waits
            bank.decide(b, r["id"], tid, "auto")
            if g.pair_id:
                skip.add(g.pair_id)
            n += 1
        con.commit()
        b.commit()
        added += n
        if not n:
            break
    bank.link(b, service.load(con))
    return added


def _reach_back(b, con) -> None:
    """A ledger set up with all its history starts at the month of the oldest bank row, including rows the bank sent
    after setup (the first sync has only recent ones; the rest follow within minutes)."""
    row = con.execute("SELECT value FROM settings WHERE key='bank_history'").fetchone()
    if not row or row[0] != "all":
        return
    first = b.execute("SELECT MIN(t.date) FROM txns t JOIN accounts a ON a.id=t.account_id WHERE a.anchor=1 "
                      "AND t.pending=0").fetchone()[0]
    start = con.execute("SELECT value FROM settings WHERE key='start_month'").fetchone()[0]
    if first and month_of(date.fromisoformat(first)).isoformat() < start:
        db.set_setting(con, "start_month", month_of(date.fromisoformat(first)).isoformat())
        con.commit()


def _settle(b, con) -> int:
    """After rows or entries change on a ledger kept from the banks: add what's sure, then hold balances to the
    bank's. Returns how many were added."""
    if not _auto(con):
        return 0
    _reach_back(b, con)
    n = auto_add(b, con)
    bank.anchor(b, con, service.load(con))
    return n


def _refresh(b, con, items: Optional[list[int]] = None) -> dict:
    with bank.syncing:
        if items is None:
            counts = bank.sync_all(b)
        else:
            counts = {}
            for iid in items:
                try:
                    counts[iid] = bank.sync_item(b, iid)
                except plaid.PlaidError as e:
                    counts[iid] = {"error": e.code, "message": e.message}
        st = service.load(con)
        paired = bank.link(b, st)
        return {"synced": counts, "paired": paired, "added": _settle(b, con)}


def _connected(b, con, access: str, item_id: str) -> dict:
    """A new connection: store it, match its accounts to the ledger's where that's clear, then pull its history."""
    iid = _plaid(bank.add_item, b, access, item_id)
    matched = bank.automap(b, service.load(con), iid)
    return {"item_id": iid, "matched": matched, **_refresh(b, con, [iid])}


_used: set[str] = set()  # public tokens already exchanged: the phone and Plaid's webhook both hand them over
_connecting = threading.Lock()


def connect_tokens(b, con, tokens: list[str]) -> list[dict]:
    out = []
    with _connecting:
        for pt in tokens:
            if pt in _used:
                continue
            try:
                access, item_id = plaid.exchange(pt)
            except plaid.PlaidError as e:
                if e.code == "INVALID_PUBLIC_TOKEN":  # exchanged already (by the other path, before a restart)
                    _used.add(pt)
                    continue
                raise HTTPException(424, {"errors": [e.message], "code": e.code})
            _used.add(pt)
            out.append(_connected(b, con, access, item_id))
    return out


@router.post("/connect", status_code=201)
async def connect(request: Request, b: Bank, con: Con):
    """Body: {"public_token": from Plaid Link} for one bank, or {"link_token": the session's} after a session that
    could add several. Stores each connection, then pulls its history."""
    raw = await body(request)
    pt = text(raw.get("public_token"), "Public token", 200)
    lt = text(raw.get("link_token"), "Link token", 200)
    if not pt and not lt:
        bad("Missing public_token.")
    tokens = [pt] if pt else await asyncio.to_thread(_plaid, plaid.session_tokens, lt)
    made = await asyncio.to_thread(connect_tokens, b, con, tokens)
    if pt and not made:
        bad("That bank is already connected.")
    first = made[0] if made else {"item_id": None, "matched": 0, "synced": {}, "paired": 0, "added": 0}
    return {**first, "items": [m["item_id"] for m in made]}


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
    if not b.execute("SELECT 1 FROM accounts WHERE id=?", (aid,)).fetchone():
        raise HTTPException(404)
    bank.assign(b, st, aid, target)
    b.commit()
    return {"paired": bank.link(b, st)}


@router.post("/sync")
def sync(b: Bank, con: Con, max_age: Optional[int] = None):
    """`max_age` (seconds): skip asking the banks when every connection was checked more recently than that (the app
    asks on every open; the banks only change a few times a day)."""
    if max_age is not None and bank.fresh(b, max_age):
        return {"synced": {}, "paired": bank.link(b, service.load(con))}
    return _refresh(b, con)


SYNC_HOURS = float(os.environ.get("TALLY_BANK_SYNC_HOURS", "4"))


def sync_now(items: Optional[list[int]] = None) -> None:
    """One background check of the banks (all, or these connections), on its own database connections."""
    b, con = bank.connect(), db.connect()
    try:
        _refresh(b, con, items)
    finally:
        b.close()
        con.close()


async def sync_loop() -> None:
    """Points every connection at the webhook, then checks the banks every SYNC_HOURS while the server runs (the
    webhook brings news sooner; this catches anything it missed)."""
    if not plaid.enabled():
        return
    try:
        b = bank.connect()
        try:
            await asyncio.to_thread(bank.point_webhooks, b)
        finally:
            b.close()
    except Exception:
        log.exception("couldn't point the connections at the webhook")
    while SYNC_HOURS > 0:
        await asyncio.sleep(SYNC_HOURS * 3600)
        try:
            await asyncio.to_thread(sync_now)
        except Exception:
            log.exception("bank sync failed")


# ---------- Plaid's webhook ----------
# Public, through its own Tailscale Funnel path, so it skips the login (auth.refuse) and proves itself instead: the
# URL carries a secret (the last part of PLAID_WEBHOOK_URL), and Plaid signs every message (plaid.verify_webhook).
hook = APIRouter()
SYNC_CODES = {"SYNC_UPDATES_AVAILABLE", "DEFAULT_UPDATE", "INITIAL_UPDATE", "HISTORICAL_UPDATE", "TRANSACTIONS_REMOVED"}
ITEM_TROUBLE = {"PENDING_EXPIRATION", "PENDING_DISCONNECT", "USER_PERMISSION_REVOKED", "USER_ACCOUNT_REVOKED"}


def _hook_key() -> str:
    return (plaid.webhook_url() or "").rstrip("/").rsplit("/", 1)[-1]


def handle(msg: dict) -> None:
    """What a verified webhook asks for, run after the answer has gone back to Plaid."""
    kind, code = msg.get("webhook_type"), msg.get("webhook_code")
    b, con = bank.connect(), db.connect()
    try:
        if kind == "LINK" and code in ("SESSION_FINISHED", "ITEM_ADD_RESULT"):
            tokens = msg.get("public_tokens") or ([msg["public_token"]] if msg.get("public_token") else [])
            connect_tokens(b, con, tokens)
            return
        row = b.execute("SELECT id FROM items WHERE item_id=?", (msg.get("item_id") or "",)).fetchone()
        if not row:
            return
        if kind == "TRANSACTIONS" and code in SYNC_CODES:
            _refresh(b, con, [row["id"]])
        elif kind == "ITEM" and code == "ERROR":
            b.execute("UPDATE items SET error=? WHERE id=?", ((msg.get("error") or {}).get("error_code") or "ERROR", row["id"]))
            b.commit()
        elif kind == "ITEM" and code in ITEM_TROUBLE:
            b.execute("UPDATE items SET error=? WHERE id=?", (code, row["id"]))
            b.commit()
        elif kind == "ITEM" and code == "LOGIN_REPAIRED":
            b.execute("UPDATE items SET error=NULL WHERE id=?", (row["id"],))
            b.commit()
            _refresh(b, con, [row["id"]])
    except Exception:
        log.exception("webhook %s %s failed", kind, code)
    finally:
        b.close()
        con.close()


@hook.post("/api/bank/webhook/{key}")
async def webhook(key: str, request: Request, tasks: BackgroundTasks):
    want = _hook_key()
    if not plaid.enabled() or not want or not hmac.compare_digest(key.encode(), want.encode()):
        raise HTTPException(404)
    raw = await request.body()
    if not await asyncio.to_thread(plaid.verify_webhook, raw, request.headers.get("plaid-verification")):
        raise HTTPException(401)
    try:
        msg = json.loads(raw)
    except ValueError:
        raise HTTPException(400)
    tasks.add_task(asyncio.to_thread, handle, msg)
    return {"ok": True}


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
    _settle(b, con)
    return _full(con, [tid])[0]


@router.post("/inbox/accept")
async def accept_many(request: Request, b: Bank, con: Con):
    """Body: {"ids": [bank row ids]}: add each as Tally guessed it. Rows already done (the other side of a transfer
    added a moment ago) or without a category are skipped. Returns the new entries."""
    raw = await body(request)
    ids = raw.get("ids")
    if not isinstance(ids, list) or not ids:
        bad("Pick some to add.")
    st = service.load(con)
    done = []
    for bid in [whole(i, "Bank row") for i in ids][:500]:
        r = b.execute("SELECT * FROM txns WHERE id=?", (bid,)).fetchone()
        if not r or r["status"] != "new" or r["pending"] or bank.guess(b, st, r).category_id is None:
            continue
        try:
            tid = _accept(b, st, r, {})
        except HTTPException:
            continue  # the guess doesn't make a whole entry (a transfer missing its other account): it waits
        con.commit()
        bank.decide(b, r["id"], tid, "added")
        b.commit()
        st = service.load(con)
        bank.link(b, st)
        done.append(tid)
    _settle(b, con)
    return _full(con, done) if done else []


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
def ignore(bid: int, b: Bank, con: Con):
    r = b.execute("SELECT status FROM txns WHERE id=?", (bid,)).fetchone()
    if not r:
        raise HTTPException(404)
    bank.decide(b, bid, None, "ignored")
    b.commit()
    _settle(b, con)
    return {"ok": True}


@router.get("/recent")
def recent(b: Bank, con: Con, days: int = 7):
    """Rows Tally added by itself lately, newest first, with the entry each became: what the check-in shows as
    "Added for you", to look over or undo."""
    st = service.load(con)
    entries = {t.id: t for t in st.txns}
    out = []
    cut = (datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 90)))).isoformat(timespec="seconds")
    for r in b.execute("SELECT * FROM txns WHERE how='auto' AND status='linked' AND decided_at >= ? "
                       "ORDER BY decided_at DESC, date DESC LIMIT 200", (cut,)):
        t = entries.get(r["txn_id"])
        if t:
            out.append({"id": r["id"], "txn_id": t.id, "date": t.date.isoformat(), "what": t.what,
                        "category_id": t.category_id, "amount": t.amount, "raw": r["raw"],
                        "account_id": t.from_id if t.from_id is not None else t.to_id})
    return out


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
    return _connected(b, con, access, item_id)
