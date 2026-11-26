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
    return await asyncio.to_thread(_link_token, b, opt_id(raw.get("item_id"), "Connection"))


def _link_token(b, iid: Optional[int]) -> dict:
    token = None
    if iid is not None:
        row = b.execute("SELECT access_token FROM items WHERE id=?", (iid,)).fetchone()
        if not row:
            raise HTTPException(404)
        token = row[0]
    user = None if token else bank.plaid_user(b)
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
    """Add every waiting row that `bank.auto_ok` passes, as its own entry. A move between your own accounts is one
    entry for both sides: the other side is paired with it at once. A second pass picks up merchants the first one
    taught. Returns how many entries were added."""
    added = 0
    for _ in range(passes):
        st = service.load(con)
        bank.link(b, st)
        n = 0
        for item in bank.inbox(b, st):
            if not item["guess"]:
                continue
            r = b.execute("SELECT * FROM txns WHERE id=?", (item["id"],)).fetchone()
            g = bank.Guess(**item["guess"])
            if r["status"] != "new" or r["how"] == "deleted" or not bank.auto_ok(g, r):
                continue  # decided already, its entry deleted by you before, or not sure enough
            pair = b.execute("SELECT * FROM txns WHERE id=?", (g.pair_id,)).fetchone() if g.pair_id else None
            if g.pair_id and (not pair or pair["status"] != "new" or pair["how"] == "deleted"):
                continue  # its other side was decided meanwhile: guess again next time
            when = min(bank._day(r), bank._day(pair)) if pair else bank._day(r)  # a move happens when money leaves
            t = Txn(None, when, g.what, g.category_id, g.from_id, g.to_id, g.amount)
            try:
                tid = _write(st, t, {})
            except HTTPException:
                continue  # doesn't fit (a date before the ledger starts, a shape the category refuses): it waits
            bank.decide(b, r["id"], tid, "auto")
            _claim(b, st, pair, t, tid)
            n += 1
        con.commit()
        b.commit()
        added += n
        if not n:
            break
    bank.link(b, service.load(con))
    return added


def _claim(b, st, pair, t: Txn, tid: int) -> None:
    """The other side of a move (still waiting) stands for the same entry, when the entry has its account on the
    right side."""
    acct = bank._mapped(b, st).get(pair["account_id"]) if pair else None
    if acct and pair["status"] == "new" and bank.fits(t, acct, pair["amount"]):
        bank.decide(b, pair["id"], tid, "matched")


def _reach_back(b, con) -> None:
    """A ledger set up with all its history starts at the month of the oldest bank row, including rows the bank sent
    after setup (the first sync has only recent ones; the rest follow within minutes)."""
    row = con.execute("SELECT value FROM settings WHERE key='bank_history'").fetchone()
    if not row or row[0] != "all":
        return
    # By the day an entry would carry (authorized, else posted), so the oldest row's entry is never before the start.
    first = b.execute("SELECT MIN(COALESCE(t.authorized_date, t.date)) FROM txns t JOIN accounts a ON a.id=t.account_id"
                      " WHERE a.anchor=1 AND t.pending=0").fetchone()[0]
    start = con.execute("SELECT value FROM settings WHERE key='start_month'").fetchone()[0]
    if first and month_of(date.fromisoformat(first)).isoformat() < start:
        db.set_setting(con, "start_month", month_of(date.fromisoformat(first)).isoformat())
        con.commit()


def _settle(b, con) -> int:
    """After rows or entries change on a ledger kept from the banks: add what's sure, then hold balances to the
    bank's. Returns how many were added."""
    if not _auto(con):
        return 0
    with bank.settling:  # a sync, a tap and setup can all get here at once
        _reach_back(b, con)
        n = auto_add(b, con)
        bank.anchor(b, con, service.load(con))
    return n


def _link(b, con):
    """Pair what can be paired, under the lock every writer of bank decisions takes. Returns the loaded state."""
    with bank.settling:
        st = service.load(con)
        bank.link(b, st)
    return st


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
    with bank.settling:
        bank.follow(b, con, service.load(con))  # the bank changed a row Tally made an entry from
        paired = bank.link(b, service.load(con))
        return {"synced": counts, "paired": paired, "added": _settle(b, con)}


def _connected(b, con, access: str, item_id: str) -> dict:
    """A new connection: store it, match its accounts to the ledger's where that's clear, then pull its history."""
    iid = _plaid(bank.add_item, b, access, item_id)
    with bank.settling:
        from .api_setup import adopt, reattach
        # A ledger built from the banks: a bank connected again first takes back the accounts it had (kept at its
        # balance), then a new bank's accounts are made as setup would have.
        back = reattach(b, con, iid) if _auto(con) else []
        matched = back + bank.automap(b, service.load(con), iid)
        made: list[dict] = adopt(b, con, iid) if _auto(con) else []
    return {"item_id": iid, "matched": matched, "made": made, **_refresh(b, con, [iid])}


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
    first = made[0] if made else {"item_id": None, "matched": [], "synced": {}, "paired": 0, "added": 0}
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
    with bank.settling:
        bank.forget(b, iid)
        b.execute("DELETE FROM items WHERE id=?", (iid,))
        b.execute("DELETE FROM meta WHERE key=?", (f"repair:{iid}",))
        b.commit()


@router.put("/accounts/{aid}")
async def map_account(aid: int, request: Request, b: Bank, con: Con):
    """Body: {"tally_account_id": id or null}: which ledger account this bank account is (null: not tracked, don't
    ask again). {"tally_account_id": null, "ask": true} puts it back among the accounts to ask about (the Undo of
    "Not Tracked")."""
    raw = await body(request)
    target = opt_id(raw.get("tally_account_id"), "Account")
    if raw.get("ask") is not None and not isinstance(raw.get("ask"), bool):
        bad("ask is true or false.")
    return await asyncio.to_thread(_map_account, b, con, aid, target, raw.get("ask") is True)


def _map_account(b, con, aid: int, target: Optional[int], ask: bool = False) -> dict:
    st = service.load(con)
    if target is not None and target not in st.acct:
        bad("Unknown account.")
    if target is not None and b.execute("SELECT 1 FROM accounts WHERE tally_account_id=? AND id!=?",
                                        (target, aid)).fetchone():
        bad(f"Another bank account is already {st.acct[target].name}.")
    if not b.execute("SELECT 1 FROM accounts WHERE id=?", (aid,)).fetchone():
        raise HTTPException(404)
    with bank.settling:
        bank.assign(b, st, aid, target)
        if ask and target is None:
            b.execute("UPDATE accounts SET skip=0 WHERE id=?", (aid,))
        b.commit()
        return {"paired": bank.link(b, st)}


@router.post("/sync")
def sync(b: Bank, con: Con, max_age: Optional[int] = None, repaired: Optional[int] = None):
    """`max_age` (seconds): skip asking the banks when every connection was checked more recently than that (the app
    asks on every open; the banks only change a few times a day). `repaired`: a connection the phone just signed in
    again through update mode (Link finished, not cancelled): this sync clears its expiry warning.

    Plaid is also asked to check the banks themselves now (bank.refresh); what they have arrives minutes later
    through the webhook. A pull to refresh (no `max_age`) asks every bank not asked in the last 10 minutes before it
    syncs; opening the app asks those not asked within the hour, without waiting for the answer. `refreshing` is how
    many banks were asked."""
    if repaired is not None:
        if not b.execute("SELECT 1 FROM items WHERE id=?", (repaired,)).fetchone():
            raise HTTPException(404)
        with bank.settling:
            bank.set_meta(b, f"repair:{repaired}", bank._now())
        return {**_refresh(b, con, [repaired]), "refreshing": 0}
    if max_age is None:
        asked = bank.claim_refresh(b, bank.REFRESH_PULL)
        bank.refresh(b, asked)
        return {**_refresh(b, con), "refreshing": len(asked)}
    asked = bank.claim_refresh(b, bank.REFRESH_OPEN, skip_errors=True)
    refresh_later(asked)
    if bank.fresh(b, max_age):
        with bank.settling:
            return {"synced": {}, "paired": bank.link(b, service.load(con)), "refreshing": len(asked)}
    return {**_refresh(b, con), "refreshing": len(asked)}


def refresh_later(items: list[tuple[int, str]]) -> Optional[threading.Thread]:
    """bank.refresh on its own thread and database connection, so the caller doesn't wait for Plaid."""
    if not items:
        return None
    path = os.environ.get("TALLY_BANK_DB")  # the request's database, even if the setting changes meanwhile

    def run():
        try:
            b = bank.connect(path)
            try:
                bank.refresh(b, items)
            finally:
                b.close()
        except Exception:  # noqa: BLE001
            log.exception("bank refresh failed")
    t = threading.Thread(target=run, name="tally-refresh-later", daemon=True)
    t.start()
    return t


SYNC_HOURS = float(os.environ.get("TALLY_BANK_SYNC_HOURS", "4"))


def sync_now(items: Optional[list[int]] = None) -> None:
    """One background check of the banks (all, or these connections), on its own database connections."""
    b, con = bank.connect(), db.connect()
    try:
        _refresh(b, con, items)
    finally:
        b.close()
        con.close()


# Plaid is asked to check every bank every REFRESH_HOURS from REFRESH_FROM to REFRESH_UNTIL, server local time
# (TZ=America/Denver on x1): 07:00, 09:00, ... 23:00. 0 turns it off.
REFRESH_HOURS = float(os.environ.get("TALLY_BANK_REFRESH_HOURS", "2"))
REFRESH_FROM, REFRESH_UNTIL = 7, 23


def next_refresh(now: datetime) -> datetime:
    """The first scheduled refresh after `now` (naive local time)."""
    first = now.replace(hour=REFRESH_FROM, minute=0, second=0, microsecond=0)
    last = now.replace(hour=REFRESH_UNTIL, minute=0, second=0, microsecond=0)
    t = first
    while t <= last:
        if t > now:
            return t
        t += timedelta(hours=REFRESH_HOURS)
    return first + timedelta(days=1)


def refresh_now() -> dict[int, str]:
    """One scheduled ask of every working bank (not those in error, not one asked in the last 10 minutes)."""
    b = bank.connect()
    try:
        return bank.refresh(b, bank.claim_refresh(b, bank.REFRESH_PULL, skip_errors=True))
    finally:
        b.close()


async def refresh_loop() -> None:
    while REFRESH_HOURS > 0:
        at = next_refresh(datetime.now())
        # In steps, so a suspended machine or a changed clock doesn't oversleep by much.
        while (left := (at - datetime.now()).total_seconds()) > 0:
            await asyncio.sleep(min(left, 900))
        try:
            await asyncio.to_thread(refresh_now)
        except Exception:
            log.exception("bank refresh failed")


async def _sync_every() -> None:
    while SYNC_HOURS > 0:
        await asyncio.sleep(SYNC_HOURS * 3600)
        try:
            await asyncio.to_thread(sync_now)
        except Exception:
            log.exception("bank sync failed")


async def sync_loop() -> None:
    """Points every connection at the webhook, then checks the banks every SYNC_HOURS while the server runs (the
    webhook brings news sooner; this catches anything it missed), and asks Plaid to check them on the
    refresh schedule."""
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
    await asyncio.gather(_sync_every(), refresh_loop())


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
    with bank.settling:
        return bank.inbox(b, _link(b, con))


def _bank_row(b, bid: int):
    r = b.execute("SELECT * FROM txns WHERE id=?", (bid,)).fetchone()
    if not r:
        raise HTTPException(404)
    if r["status"] != "new":
        raise HTTPException(409, {"errors": ["That one is already done."]})
    if r["pending"]:
        bad("It's still pending at the bank; it can change until it posts.")
    return r


def _accept(b, st, r, over: dict, g: Optional[bank.Guess] = None) -> int:
    """Write the entry a bank row stands for (the guess, with anything the body sends instead), and pair the other
    side of a move with it. Doesn't commit the ledger."""
    g = g or bank.guess(b, st, r)
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
    entry = Txn(None, when, what, cat, f, t, amt)
    tid = _write(st, entry, meta)
    bank.decide(b, r["id"], tid, "added")
    if g.pair_id:
        _claim(b, st, b.execute("SELECT * FROM txns WHERE id=?", (g.pair_id,)).fetchone(), entry, tid)
    return tid


@router.post("/inbox/{bid}/accept", status_code=201)
async def accept(bid: int, request: Request, b: Bank, con: Con):
    """Body (all optional): what, category_id, from_id, to_id, amount (dollars), date, note."""
    over = await body(request)
    return await asyncio.to_thread(_accept_one, b, con, bid, over)


def _accept_one(b, con, bid: int, over: dict) -> dict:
    with bank.settling:  # checked and written under the lock: a settle running now can't add it as well
        r = _bank_row(b, bid)
        st = service.load(con)
        tid = _accept(b, st, r, over)
        con.commit()
        b.commit()
        bank.link(b, service.load(con))
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
    return await asyncio.to_thread(_accept_many, b, con, [whole(i, "Bank row") for i in ids][:500])


def _accept_many(b, con, ids: list[int]) -> list:
    with bank.settling:
        return _accept_rows(b, con, ids)


def _accept_rows(b, con, ids: list[int]) -> list:
    """Add each row as Tally guessed it (guessed once for the batch, as the inbox showed them). Rows already done
    (the other side of a move added a moment ago), pending or without a category are skipped."""
    st = service.load(con)
    seen, pfc = bank.history(b, st)
    mapped = bank._mapped(b, st)
    paired = bank.moves(b, st, mapped)
    done = []
    for bid in ids:
        r = b.execute("SELECT * FROM txns WHERE id=?", (bid,)).fetchone()
        if not r or r["status"] != "new" or r["pending"]:
            continue
        g = bank.guess(b, st, r, seen, pfc, mapped, paired)
        if g.category_id is None:
            continue
        try:
            tid = _accept(b, st, r, {}, g)
        except HTTPException:
            continue  # the guess doesn't make a whole entry (a transfer missing its other account): it waits
        con.commit()
        b.commit()
        done.append(tid)
    bank.link(b, service.load(con))
    _settle(b, con)
    return _full(con, done) if done else []


@router.post("/inbox/accept-sure")
def accept_sure(b: Bank, con: Con):
    """Add every posted row whose guess is "sure", each as its own entry. Returns the new entries."""
    with bank.settling:
        return _accept_sure(b, con)


def _accept_sure(b, con) -> list:
    """The same loop as Add all: a row that can't make a whole entry waits, and the rest are added and settled."""
    st = _link(b, con)
    return _accept_rows(b, con, [x["id"] for x in bank.inbox(b, st)
                                 if x["guess"] and x["guess"]["confidence"] == "sure"])


@router.post("/inbox/{bid}/pair")
async def pair(bid: int, request: Request, b: Bank, con: Con):
    """Body: {"txn_id": id, "how"?: "manual" | "auto"}: this bank row is that entry, already in Tally. "auto" is for
    putting back an entry Tally added by itself (the Undo of Remove), so it stays under Added Automatically."""
    raw = await body(request)
    tid = whole(raw.get("txn_id"), "Entry")
    how = raw.get("how") or "manual"
    if how not in ("manual", "auto"):
        bad("how is manual or auto.")
    return await asyncio.to_thread(_pair, b, con, bid, tid, how)


def _pair(b, con, bid: int, tid: int, how: str = "manual") -> dict:
    with bank.settling:
        r = _bank_row(b, bid)
        e = con.execute("SELECT * FROM transactions WHERE id=?", (tid,)).fetchone()
        if not e:
            raise HTTPException(404)
        mapped = bank._mapped(b, service.load(con))
        acct = mapped.get(r["account_id"])
        if acct is None:
            bad("Pick the Tally account this bank account is first.")
        t = Txn(e["id"], date.fromisoformat(e["date"]), e["what"], e["category_id"], e["from_account_id"],
                e["to_account_id"], e["amount"])
        # The amount may differ (a tip added at the bank); the account and the direction can't.
        if acct not in (t.from_id, t.to_id) or bank._out(t, acct) != (r["amount"] > 0):
            bad("That entry isn't this bank line: it doesn't move money the same way on this account.")
        if any(mapped.get(o["account_id"]) == acct for o in b.execute(
                "SELECT account_id FROM txns WHERE txn_id=? AND status='linked'", (tid,))):
            raise HTTPException(409, {"errors": ["Another bank line on this account is already that entry."]})
        bank.decide(b, bid, tid, how)
        b.commit()
    return {"ok": True}


@router.post("/inbox/{bid}/ignore")
def ignore(bid: int, b: Bank, con: Con):
    with bank.settling:
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
    mapped = bank._mapped(b, st)
    out = []
    cut = (datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 90)))).isoformat(timespec="seconds")
    for r in b.execute("SELECT * FROM txns WHERE how='auto' AND status='linked' AND decided_at >= ? "
                       "ORDER BY decided_at DESC, date DESC LIMIT 200", (cut,)):
        t = entries.get(r["txn_id"])
        if t:
            out.append({"id": r["id"], "txn_id": t.id, "date": t.date.isoformat(), "what": t.what,
                        "category_id": t.category_id, "amount": t.amount, "raw": r["raw"],
                        "account_id": mapped.get(r["account_id"], t.from_id if t.from_id is not None else t.to_id)})
    return out


@router.post("/txns/{bid}/reset")
def reset(bid: int, b: Bank):
    """Undo a pairing or an ignore. The entry itself stays; delete it in Tally if it shouldn't be there."""
    with bank.settling:
        if not b.execute("UPDATE txns SET status='new', txn_id=NULL, how=NULL, decided_at=NULL WHERE id=?",
                         (bid,)).rowcount:
            raise HTTPException(404)
        b.commit()
    return {"ok": True}


@router.get("/audit/{aid}")
def audit(aid: int, b: Bank, con: Con):
    r = bank.audit(b, _link(b, con), aid)
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
