"""First-time setup from the banks (Tally Lab, where Plaid keys are set): a ledger with no accounts yet takes its
accounts from the connected banks, gets a starter set of categories, starts counting from the bank history (all of
it, or this month), adds every row it's sure about, and holds each account at the bank's balance from then on.

The banks are connected first with the usual /api/bank/link-token and /api/bank/connect. Nothing here runs on a
ledger that already has accounts."""
from __future__ import annotations
import re
import sqlite3
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Request
from . import bank, db, plaid, service
from .api import Con
from .api_bank import Bank, _on, _settle
from .engine import month_of
from .inputs import bad, body, text, whole

router = APIRouter(prefix="/api/setup", dependencies=[Depends(_on)])
KIND = {"depository": "cash", "credit": "card", "loan": "loan", "investment": "investment"}
SHORT = {"american express": "Amex", "wells fargo": "Wells Fargo", "charles schwab": "Schwab",
         "jpmorgan chase": "Chase", "chase": "Chase", "bank of america": "Bank of America"}


def _brand(institution: str | None) -> str:
    """"JPMorgan Chase Bank, N.A." -> "Chase": the name people call the bank."""
    s = (institution or "").strip()
    low = s.lower()
    for k, v in SHORT.items():
        if k in low:
            return v
    return re.sub(r"\b(bank|n\.?a\.?|national association|financial|inc\.?|corp\.?|,)\b", "", s, flags=re.I).strip(" ,-") or s


def _title(s: str) -> str:
    return " ".join(w if any(c.islower() for c in w) or len(w) <= 3 else w.capitalize() for w in s.split())


def suggest(institution: str | None, a) -> str:
    """A name for the ledger account: the bank's own name for it, with the bank in front ("Chase Total Checking").
    The official name only when it's short; "Plaid Gold Standard 0% Interest Checking" is just "Plaid Checking"."""
    brand = _brand(institution)
    official = re.sub(r"[®™]", "", a["official_name"] or "").strip()
    own = _title(official if official and len(official) <= 26 else re.sub(r"[®™]", "", a["name"] or "Account")).strip()
    return own if not brand or brand.lower() in own.lower() else f"{brand} {own}"


def _needed(con) -> bool:
    return not con.execute("SELECT 1 FROM accounts LIMIT 1").fetchone()


@router.get("")
def status(b: Bank, con: Con):
    """Whether this ledger still needs setting up, and the connected banks' accounts as setup would make them."""
    items = []
    for it in b.execute("SELECT * FROM items ORDER BY id"):
        accts = []
        for a in b.execute("SELECT * FROM accounts WHERE item_id=? ORDER BY id", (it["id"],)):
            kind = KIND.get(a["type"] or "")
            n = b.execute("SELECT COUNT(*), MIN(date) FROM txns WHERE account_id=? AND pending=0", (a["id"],)).fetchone()
            accts.append({"id": a["id"], "name": a["name"], "mask": a["mask"], "type": a["type"], "subtype": a["subtype"],
                          "kind": kind, "suggested": suggest(it["institution"], a), "include": kind is not None,
                          "current": a["current"], "rows": n[0], "first": n[1]})
        items.append({"id": it["id"], "institution": it["institution"], "brand": _brand(it["institution"]),
                      "color": it["color"], "logo": bool(it["logo"] or it["website"]), "accounts": accts})
    return {"needed": _needed(con), "env": plaid.env(), "items": items}


@router.post("")
async def finish(request: Request, b: Bank, con: Con):
    """Body: {"accounts": [{"id": bank account id, "name": str, "include": bool}], "history": "all" | "month"}.
    Bank accounts left out are marked not tracked. Returns what it made."""
    if not _needed(con):
        raise HTTPException(409, {"errors": ["Tally is already set up."]})
    raw = await body(request)
    history = raw.get("history", "all")
    if history not in ("all", "month"):
        bad("history is all or month.")
    picks = raw.get("accounts")
    if not isinstance(picks, list) or not picks:
        bad("Pick the accounts to track.")
    today = service.load(con).today
    chosen: list[tuple[sqlite3.Row, str]] = []
    names: set[str] = set()
    for p in picks:
        aid = whole(p.get("id"), "Account")
        a = b.execute("SELECT a.*, i.institution FROM accounts a JOIN items i ON i.id=a.item_id WHERE a.id=?",
                      (aid,)).fetchone()
        if not a:
            bad("Unknown bank account.")
        if not p.get("include", True) or KIND.get(a["type"] or "") is None:
            b.execute("UPDATE accounts SET skip=1, tally_account_id=NULL WHERE id=?", (aid,))
            continue
        name = text(p.get("name"), "Name") or suggest(a["institution"], a)
        if name.lower() in names:
            name = f"{name} {a['mask'] or aid}"
        names.add(name.lower())
        chosen.append((a, name))
    if not chosen:
        bad("Pick at least one account to track.")

    # Where counting starts: the month of the oldest posted row on an account that takes rows, or this month.
    synced = [a["id"] for a, _ in chosen if KIND[a["type"]] in bank.SYNCED_KINDS]
    first = None
    if history == "all" and synced:
        first = b.execute(f"SELECT MIN(date) FROM txns WHERE pending=0 AND account_id IN ({','.join('?' * len(synced))})",
                          synced).fetchone()[0]
    start = month_of(date.fromisoformat(first)) if first else today.replace(day=1)
    db.set_setting(con, "start_month", start.isoformat())

    if not con.execute("SELECT 1 FROM categories LIMIT 1").fetchone():
        con.executemany("INSERT INTO categories(name, type, sort) VALUES(?,?,?)",
                        [(n, t, i) for i, (n, t) in enumerate(bank.DEFAULT_CATEGORIES)])
    made = []
    for i, (a, name) in enumerate(chosen):
        tid = con.execute("INSERT INTO accounts(name, kind, bank, start_balance, sort) VALUES(?,?,?,0,?)",
                          (name, KIND[a["type"]], _brand(a["institution"]), i)).lastrowid
        # All history: no start on the inbox, since the bank keeps sending older rows for a few minutes after
        # connecting, and the ledger's start month follows them back (api_bank._settle).
        b.execute("UPDATE accounts SET tally_account_id=?, since=?, skip=0, anchor=1 WHERE id=?",
                  (tid, None if history == "all" else start.isoformat(), a["id"]))
        made.append({"id": tid, "name": name, "kind": KIND[a["type"]]})
    db.set_setting(con, "bank_auto", "1")
    db.set_setting(con, "bank_history", history)
    con.commit()
    b.commit()
    added = _settle(b, con)
    st = service.load(con)
    return {"accounts": made, "start": start.isoformat(), "added": added, "waiting": bank.waiting(b, st)}


def adopt(b, con, iid: int) -> list[dict]:
    """A bank connected after setup, on a ledger built from the banks (`bank_auto`): each of its accounts nobody has
    placed becomes a ledger account the way setup makes them (named after the bank's, held at its balance, all its
    history), so a new bank needs no answers. Accounts of a kind Tally doesn't keep are left alone."""
    made = []
    rows = b.execute("SELECT a.*, i.institution FROM accounts a JOIN items i ON i.id=a.item_id "
                     "WHERE a.item_id=? AND a.tally_account_id IS NULL AND a.skip=0 ORDER BY a.id", (iid,)).fetchall()
    taken = {r[0].lower() for r in con.execute("SELECT name FROM accounts")}
    sort = (con.execute("SELECT MAX(sort) FROM accounts").fetchone()[0] or 0) + 1
    for a in rows:
        kind = KIND.get(a["type"] or "")
        if kind is None:
            continue
        name = suggest(a["institution"], a)
        if name.lower() in taken:
            name = f"{name} {a['mask'] or a['id']}"
        taken.add(name.lower())
        tid = con.execute("INSERT INTO accounts(name, kind, bank, start_balance, sort) VALUES(?,?,?,0,?)",
                          (name, kind, _brand(a["institution"]), sort)).lastrowid
        sort += 1
        b.execute("UPDATE accounts SET tally_account_id=?, since=NULL, skip=0, anchor=1 WHERE id=?", (tid, a["id"]))
        made.append({"id": tid, "name": name, "kind": kind})
    con.commit()
    b.commit()
    return made

