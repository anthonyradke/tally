"""Bank sync: transactions from Plaid, paired with the ledger's entries, and a best guess for the ones nobody has
entered yet.

The bank's rows live in their own database (TALLY_BANK_DB, default data/bank.db), not in tally.db. The ledger stays
exactly what it was, and copies of tally.db (the nightly snapshots, the Mac's iCloud copy) never carry the
connections' access tokens. A bank row points at the entry it stands for by id (`txn_id`); `link()` checks every
such pointer against the ledger and re-pairs rows whose entry has gone, so the ledger can be replaced (a fresh copy
of the real one, in Tally Lab) without the two drifting apart.

How a row becomes an entry, best first:
  1. It pairs with an entry already in the ledger: same account, same size, same direction, within WINDOW days.
  2. Its merchant has been seen before: the bank rows already paired with entries are the history, and the most
     common name and category among the same merchant's rows is the guess. Nothing is stored as a separate rule;
     every entry you confirm or type yourself teaches it.
  3. A transfer: a row of the opposite sign and the same size on another connected account within a few days (a
     card payment shows on the checking account and on the card).
  4. Plaid's own category, mapped onto yours by what your history did with it, else by name.
"""
from __future__ import annotations
import os
import re
import sqlite3
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from . import plaid
from .engine import Txn

WINDOW = 3  # days between the bank's date and the entry's
PAIR_DAYS = 5  # days between the two sides of a transfer
SYNCED_KINDS = ("cash", "card")  # loans and investments follow typed balances; only their balances come across
FRESH_DAYS = 30  # how far back the inbox starts on an account with no entries yet

SCHEMA = """
CREATE TABLE IF NOT EXISTS items(
  id INTEGER PRIMARY KEY, item_id TEXT UNIQUE NOT NULL, access_token TEXT NOT NULL, institution TEXT,
  cursor TEXT, error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), synced_at TEXT);
CREATE TABLE IF NOT EXISTS accounts(
  id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  plaid_id TEXT UNIQUE NOT NULL, name TEXT NOT NULL, official_name TEXT, mask TEXT, type TEXT, subtype TEXT,
  tally_account_id INTEGER, current INTEGER, available INTEGER, balance_at TEXT);
CREATE TABLE IF NOT EXISTS txns(
  id INTEGER PRIMARY KEY AUTOINCREMENT, plaid_id TEXT UNIQUE NOT NULL,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date TEXT NOT NULL, authorized_date TEXT, raw TEXT NOT NULL DEFAULT '', merchant TEXT, entity TEXT,
  counterparty TEXT, amount INTEGER NOT NULL, pending INTEGER NOT NULL DEFAULT 0, pending_id TEXT,
  pfc TEXT, pfc_detail TEXT, logo TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','linked','ignored')),
  txn_id INTEGER, how TEXT, decided_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS txns_account ON txns(account_id, date);
CREATE INDEX IF NOT EXISTS txns_txn ON txns(txn_id);
"""


def connect(path: Optional[str] = None) -> sqlite3.Connection:
    path = path or os.environ.get("TALLY_BANK_DB", "data/bank.db")
    fresh = path != ":memory:" and not os.path.exists(path)
    if path != ":memory:":
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    con = sqlite3.connect(path, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    con.executescript(SCHEMA)
    have = {r[1] for r in con.execute("PRAGMA table_info(accounts)")}
    for col, decl in (("since", "TEXT"), ("skip", "INTEGER NOT NULL DEFAULT 0")):
        if col not in have:  # added 2026-11-24
            con.execute(f"ALTER TABLE accounts ADD COLUMN {col} {decl}")
    con.commit()
    if fresh:
        os.chmod(path, 0o600)  # it holds the access tokens
    return con


def session():
    con = connect()
    try:
        yield con
    finally:
        con.close()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _cents(v) -> Optional[int]:
    return None if v is None else int(round(float(v) * 100))


# ---------- connecting and syncing ----------

def add_item(bcon, access_token: str, item_id: str) -> int:
    """Store a new connection and its accounts. A connection repaired in update mode keeps its item_id: same row."""
    try:
        inst = plaid.item(access_token)["item"].get("institution_id")
        name = plaid.institution(inst)["name"] if inst else None
    except plaid.PlaidError:
        name = None
    bcon.execute("INSERT INTO items(item_id, access_token, institution) VALUES(?,?,?) ON CONFLICT(item_id) "
                 "DO UPDATE SET access_token=excluded.access_token, error=NULL", (item_id, access_token, name))
    iid = bcon.execute("SELECT id FROM items WHERE item_id=?", (item_id,)).fetchone()[0]
    _store_accounts(bcon, iid, plaid.accounts(access_token))
    bcon.commit()
    return iid


def _store_accounts(bcon, iid: int, accounts: list[dict]) -> None:
    for a in accounts:
        b = a.get("balances") or {}
        bcon.execute(
            "INSERT INTO accounts(item_id, plaid_id, name, official_name, mask, type, subtype, current, available,"
            " balance_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(plaid_id) DO UPDATE SET name=excluded.name,"
            " official_name=excluded.official_name, mask=excluded.mask, current=excluded.current,"
            " available=excluded.available, balance_at=excluded.balance_at",
            (iid, a["account_id"], a.get("name") or "Account", a.get("official_name"), a.get("mask"), a.get("type"),
             a.get("subtype"), _cents(b.get("current")), _cents(b.get("available")), _now()))


def _row(t: dict) -> tuple:
    pfc = t.get("personal_finance_category") or {}
    cp = next((c.get("name") for c in t.get("counterparties") or [] if c.get("name")), None)
    return (t["transaction_id"], t.get("date"), t.get("authorized_date"),
            t.get("original_description") or t.get("name") or "", t.get("merchant_name"),
            t.get("merchant_entity_id"), cp, _cents(t.get("amount")) or 0, int(bool(t.get("pending"))),
            t.get("pending_transaction_id"), pfc.get("primary"), pfc.get("detailed"), t.get("logo_url"))


def _upsert(bcon, t: dict, accounts: dict[str, int]) -> None:
    aid = accounts.get(t["account_id"])
    if aid is None:
        return
    r = _row(t)
    bcon.execute(
        "INSERT INTO txns(plaid_id, date, authorized_date, raw, merchant, entity, counterparty, amount, pending,"
        " pending_id, pfc, pfc_detail, logo, account_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
        " ON CONFLICT(plaid_id) DO UPDATE SET date=excluded.date, authorized_date=excluded.authorized_date,"
        " raw=excluded.raw, merchant=excluded.merchant, entity=excluded.entity, counterparty=excluded.counterparty,"
        " amount=excluded.amount, pending=excluded.pending, pfc=excluded.pfc, pfc_detail=excluded.pfc_detail,"
        " logo=excluded.logo", (*r, aid))
    pend = t.get("pending_transaction_id")
    if pend and not t.get("pending"):
        # The posted copy of a charge seen while pending: keep what was decided about it.
        old = bcon.execute("SELECT status, txn_id, how, decided_at FROM txns WHERE plaid_id=?", (pend,)).fetchone()
        if old and old["status"] != "new":
            bcon.execute("UPDATE txns SET status=?, txn_id=?, how=?, decided_at=? WHERE plaid_id=?",
                         (*old, t["transaction_id"]))
        bcon.execute("DELETE FROM txns WHERE plaid_id=?", (pend,))


def sync_item(bcon, iid: int) -> dict:
    """Pull everything new for one connection. The cursor is saved only once a whole run of pages is in, and a run
    the bank changed under us starts over from the saved cursor, as Plaid asks."""
    it = bcon.execute("SELECT * FROM items WHERE id=?", (iid,)).fetchone()
    counts = Counter()
    for _attempt in range(3):
        cursor, pages = it["cursor"], []
        try:
            while True:
                page = plaid.sync(it["access_token"], cursor)
                pages.append(page)
                cursor = page["next_cursor"]
                if not page.get("has_more"):
                    break
        except plaid.PlaidError as e:
            if e.code == "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION":
                continue
            bcon.execute("UPDATE items SET error=? WHERE id=?", (e.code, iid))
            bcon.commit()
            raise
        break
    else:
        raise plaid.PlaidError("SYNC_RETRIES", "The bank kept changing during sync; try again shortly.")
    try:
        _store_accounts(bcon, iid, plaid.accounts(it["access_token"]))
    except plaid.PlaidError:
        pass  # balances are a bonus; the transactions are in
    accts = {r["plaid_id"]: r["id"] for r in bcon.execute("SELECT id, plaid_id FROM accounts WHERE item_id=?", (iid,))}
    for page in pages:
        for kind in ("added", "modified"):
            for t in page.get(kind, []):
                _upsert(bcon, t, accts)
                counts[kind] += 1
        for t in page.get("removed", []):
            # A removed row that was already paired keeps its entry; the entry is the user's.
            counts["removed"] += bcon.execute("DELETE FROM txns WHERE plaid_id=? AND status='new'",
                                              (t["transaction_id"],)).rowcount
    bcon.execute("UPDATE items SET cursor=?, error=NULL, synced_at=? WHERE id=?", (cursor, _now(), iid))
    bcon.commit()
    return dict(counts)


def fresh(bcon, max_age: int) -> bool:
    """Every connection was checked within the last `max_age` seconds."""
    cut = (datetime.now(timezone.utc) - timedelta(seconds=max_age)).isoformat(timespec="seconds")
    rows = bcon.execute("SELECT synced_at FROM items").fetchall()
    return all(r[0] and r[0] > cut for r in rows)


def sync_all(bcon) -> dict:
    out = {}
    for it in bcon.execute("SELECT id, institution FROM items").fetchall():
        try:
            out[it["id"]] = sync_item(bcon, it["id"])
        except plaid.PlaidError as e:
            out[it["id"]] = {"error": e.code, "message": e.message}
    return out


# ---------- which ledger account each bank account is ----------

def kinds_for(a) -> tuple[str, ...]:
    """The ledger account kinds a bank account can be, by Plaid's type (an HSA is a depository at the bank and often
    an investment in Tally)."""
    if a["type"] == "credit":
        return ("card",)
    if a["type"] == "depository":
        return ("cash", "investment") if a["subtype"] == "hsa" else ("cash",)
    return (a["type"],) if a["type"] in ("loan", "investment") else ()


def start_for(st, acct_id: int) -> str:
    """Where the inbox starts on a newly connected account: a few days before its last entry, so a week not caught
    up yet comes in and the years before (the audit's business) don't. An account with no entries starts a month
    back."""
    last = max((t.date for t in st.txns if acct_id in (t.from_id, t.to_id) and t.date <= st.today), default=None)
    return ((last - timedelta(days=WINDOW)) if last else (st.today - timedelta(days=FRESH_DAYS))).isoformat()


def assign(bcon, st, aid: int, target: Optional[int]) -> None:
    """Make bank account `aid` the ledger account `target`, or none (`skip`: asked and answered, don't ask again)."""
    since = start_for(st, target) if target is not None else None
    bcon.execute("UPDATE accounts SET tally_account_id=?, since=?, skip=? WHERE id=?",
                 (target, since, int(target is None), aid))


_ALIAS = {"american": "amex", "express": "amex", "cc": "card", "credit": "card", "savings": "saving",
          "hysa": "saving", "loans": "loan"}
_STOP = {"bank", "account", "plaid", "the", "of", "na", "fsb", "n"}


def _tokens(*texts) -> set[str]:
    out = set()
    for t in texts:
        for w in re.split(r"[^a-z0-9]+", (t or "").lower().replace("(k)", "k")):
            w = _ALIAS.get(w, w)
            if w and w not in _STOP:
                out.add(w)
    return out


def automap(bcon, st, iid: int) -> list[dict]:
    """Match a new connection's accounts to ledger accounts by kind and shared words (Chase + checking is Chase
    Checking, American Express is Amex CC), only where one account clearly wins. The rest wait for an answer."""
    inst = (bcon.execute("SELECT institution FROM items WHERE id=?", (iid,)).fetchone() or [None])[0]
    taken = {r[0] for r in bcon.execute("SELECT tally_account_id FROM accounts WHERE tally_account_id IS NOT NULL")}
    done = []
    for a in bcon.execute("SELECT * FROM accounts WHERE item_id=? AND tally_account_id IS NULL AND skip=0 ORDER BY id",
                          (iid,)).fetchall():
        words = _tokens(inst, a["name"], a["official_name"], a["subtype"])
        scored = sorted(((len(words & _tokens(x.name)), x.id) for x in st.accounts
                         if x.kind in kinds_for(a) and x.id not in taken and x.id not in st.hidden), reverse=True)
        if scored and scored[0][0] > 0 and (len(scored) == 1 or scored[0][0] > scored[1][0]):
            assign(bcon, st, a["id"], scored[0][1])
            taken.add(scored[0][1])
            done.append({"bank_account": a["name"], "account_id": scored[0][1]})
    bcon.commit()
    return done


def ask(bcon) -> list[dict]:
    """Everyday accounts (checking, savings, cards) nobody has said yet are or aren't one of the ledger's."""
    return [{"id": r["id"], "name": r["name"], "mask": r["mask"], "institution": r["institution"],
             "kinds": list(kinds_for(r))}
            for r in bcon.execute(
                "SELECT a.*, i.institution FROM accounts a JOIN items i ON i.id=a.item_id WHERE a.tally_account_id IS "
                "NULL AND a.skip=0 AND (a.type='credit' OR (a.type='depository' AND a.subtype IN ('checking',"
                "'savings'))) ORDER BY a.id")]


# ---------- pairing with the ledger ----------

def _mapped(bcon, st) -> dict[int, int]:
    """bank account id -> ledger account id, for connected accounts whose ledger account takes transactions."""
    return {r["id"]: r["tally_account_id"] for r in bcon.execute(
        "SELECT id, tally_account_id FROM accounts WHERE tally_account_id IS NOT NULL")
        if r["tally_account_id"] in st.acct and st.acct[r["tally_account_id"]].kind in SYNCED_KINDS}


def _out(t: Txn, acct: int) -> bool:
    """Whether an entry takes money out of the account (as Plaid would sign it positive)."""
    return (t.from_id == acct) == (t.amount > 0)


def _day(r) -> date:
    return date.fromisoformat(r["authorized_date"] or r["date"])


def link(bcon, st) -> int:
    """Check every pairing against the ledger and pair new rows with entries already there. Returns how many rows
    were newly paired."""
    entries = {t.id: t for t in st.txns}
    gone = [r["id"] for r in bcon.execute("SELECT id, txn_id FROM txns WHERE status='linked'")
            if r["txn_id"] not in entries]
    if gone:  # the entry was deleted, or the ledger is a fresh copy without it
        bcon.executemany("UPDATE txns SET status='new', txn_id=NULL, how=NULL, decided_at=NULL WHERE id=?",
                         [(i,) for i in gone])
    mapped = _mapped(bcon, st)
    taken: set[tuple[int, int]] = {(r["account_id"], r["txn_id"]) for r in bcon.execute(
        "SELECT account_id, txn_id FROM txns WHERE status='linked'")}
    fresh = [r for r in bcon.execute("SELECT * FROM txns WHERE status='new' AND pending=0 ORDER BY date, id")
             if r["account_id"] in mapped]
    n, done = 0, set()
    for gap in range(WINDOW + 1):  # exact dates first, so a daily $4.50 coffee pairs with its own day
        for r in fresh:
            if r["id"] in done:
                continue
            acct, day = mapped[r["account_id"]], _day(r)
            hit = next((t for t in sorted(entries.values(), key=lambda t: (t.date, t.id))
                        if acct in (t.from_id, t.to_id) and (r["account_id"], t.id) not in taken
                        and abs(t.amount) == abs(r["amount"]) and _out(t, acct) == (r["amount"] > 0)
                        and abs((t.date - day).days) == gap), None)
            if hit:
                bcon.execute("UPDATE txns SET status='linked', txn_id=?, how='matched', decided_at=? WHERE id=?",
                             (hit.id, _now(), r["id"]))
                taken.add((r["account_id"], hit.id))
                done.add(r["id"])
                n += 1
    bcon.commit()
    return n


# ---------- guessing ----------

_PREFIX = re.compile(
    r"^(SQ ?\*|TST\* ?|SP \*?|PAYPAL \*|PP\*|POS (DEBIT|PURCHASE) |DEBIT CARD PURCHASE |CHECKCARD \d+ |"
    r"(RECURRING )?PURCHASE AUTHORIZED ON \d\d/\d\d |ACH (DEBIT|CREDIT) |DBT CRD \d+ |IN \*)+")
_STATES = set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC "
              "ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split())


def clean(raw: str) -> str:
    """A bank's line reduced to the words that name the merchant: no card-network prefixes, store numbers, dates,
    phone numbers or trailing state."""
    s = re.sub(r"\s+", " ", (raw or "").upper()).strip()
    s = _PREFIX.sub("", s)
    words = [w for w in re.split(r"[^A-Z0-9&']+", s) if w and not re.search(r"\d", w)]
    while len(words) > 1 and words[-1] in _STATES:
        words.pop()
    return " ".join(words[:4])


def keys(r) -> list[str]:
    """Ways to recognise the same merchant, most specific first."""
    out = []
    if r["entity"]:
        out.append("e:" + r["entity"])
    if r["merchant"]:
        out.append("m:" + clean(r["merchant"]))
    if c := clean(r["raw"]):
        out.append("d:" + c)
    return out


def _title(s: str) -> str:
    return " ".join(w if any(ch.isdigit() for ch in w) else w.capitalize() for w in s.split())


def name_for(r) -> str:
    return r["merchant"] or r["counterparty"] or _title(clean(r["raw"])) or r["raw"][:60] or "Bank entry"


@dataclass
class Guess:
    what: str
    category_id: Optional[int]
    from_id: Optional[int]
    to_id: Optional[int]
    amount: int  # cents, as the entry would carry it
    confidence: str  # sure, likely, guess, unknown
    source: str  # history, transfer, plaid, none
    why: str
    pair_id: Optional[int] = None  # the other side of a transfer


# Plaid's categories (https://plaid.com/documents/pfc-taxonomy-all.csv) to words likely in a category's name,
# used only until the history has seen the category.
HINTS = {
    "FOOD_AND_DRINK_GROCERIES": ("grocer",), "FOOD_AND_DRINK": ("dining", "restaurant", "food", "eating"),
    "TRANSPORTATION_GAS": ("gas", "fuel"), "TRANSPORTATION": ("car", "transport"),
    "GENERAL_MERCHANDISE": ("shopping",), "ENTERTAINMENT": ("entertainment", "fun"),
    "RENT_AND_UTILITIES": ("utilit", "home", "rent"), "MEDICAL": ("health", "medical"),
    "PERSONAL_CARE": ("health", "personal"), "INCOME_WAGES": ("paycheck", "salary", "pay"),
    "INCOME_INTEREST_EARNED": ("interest",), "INCOME": ("income",),
    "ENTERTAINMENT_CASINOS_AND_GAMBLING": ("gambling",), "GENERAL_SERVICES": ("subscription", "service"),
    "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT": ("credit card payment", "card payment"),
    "LOAN_PAYMENTS_CAR_PAYMENT": ("car loan",), "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT": ("student loan",),
    "TRANSFER_IN": ("between accounts", "transfer"), "TRANSFER_OUT": ("between accounts", "transfer"),
}


def _by_name(st, r) -> Optional[int]:
    for code in (r["pfc_detail"], r["pfc"]):
        for hint in HINTS.get(code or "", ()):
            hit = next((c.id for c in st.categories if hint in c.name.lower()), None)
            if hit:
                return hit
    return None


def history(bcon, st) -> tuple[dict[str, Counter], dict[str, Counter]]:
    """From every paired row: merchant key -> Counter of (name, category, other account), and Plaid category ->
    Counter of category ids."""
    entries = {t.id: t for t in st.txns}
    mapped = _mapped(bcon, st)
    seen: dict[str, Counter] = {}
    pfc: dict[str, Counter] = {}
    for r in bcon.execute("SELECT * FROM txns WHERE status='linked'"):
        t = entries.get(r["txn_id"])
        if not t or r["account_id"] not in mapped:
            continue
        acct = mapped[r["account_id"]]
        other = t.to_id if t.from_id == acct else t.from_id
        for k in keys(r):
            seen.setdefault(k, Counter())[(t.what, t.category_id, other)] += 1
        for code in (r["pfc_detail"], r["pfc"]):
            if code:
                pfc.setdefault(code, Counter())[t.category_id] += 1
    return seen, pfc


def shape(st, cat_id: Optional[int], acct: int, other: Optional[int], plaid_amount: int) -> tuple:
    """(from, to, amount) for an entry on `acct` in category `cat_id` that moved `plaid_amount` (Plaid's sign)."""
    kind = st.cat[cat_id].type if cat_id in st.cat else "Spending"
    if kind == "Spending":
        return acct, None, plaid_amount  # a refund is a negative charge
    if kind == "Money in":
        return None, acct, -plaid_amount
    if plaid_amount > 0:
        return acct, other, plaid_amount
    return other, acct, -plaid_amount


def guess(bcon, st, r, seen=None, pfc=None, mapped=None, fresh=None) -> Guess:
    if seen is None:
        seen, pfc = history(bcon, st)
    mapped = mapped if mapped is not None else _mapped(bcon, st)
    acct = mapped.get(r["account_id"])
    name = name_for(r)
    for k in keys(r):
        c = seen.get(k)
        if not c:
            continue
        total = sum(c.values())
        (what, cat, other), top = c.most_common(1)[0]
        cats = Counter()
        for (_, cid, _), n in c.items():
            cats[cid] += n
        share = cats[cat] / total
        conf = "sure" if total >= 2 and share >= 0.8 else "likely" if share >= 0.6 else "guess"
        f, t, amt = shape(st, cat, acct, other, r["amount"])
        return Guess(what, cat, f, t, amt, conf, "history",
                     f"Seen {total} time{'s' * (total > 1)} before as {what} ({st.cat[cat].name})"
                     if cat in st.cat else f"Seen {total} times before")
    # a transfer between two connected accounts
    others = fresh if fresh is not None else bcon.execute(
        "SELECT * FROM txns WHERE pending=0 AND status!='ignored' AND id!=?", (r["id"],)).fetchall()
    day = _day(r)
    pair = next((o for o in others if o["id"] != r["id"] and o["amount"] == -r["amount"]
                 and o["account_id"] != r["account_id"] and o["account_id"] in mapped
                 and abs((_day(o) - day).days) <= PAIR_DAYS), None)
    if pair and acct:
        other = mapped[pair["account_id"]]
        cat = _transfer_category(st, acct, other)
        if cat is not None:
            f, t, amt = shape(st, cat, acct, other, r["amount"])
            return Guess(st.cat[cat].name, cat, f, t, amt, "likely", "transfer",
                         f"Matches {abs(r['amount']) / 100:,.2f} on {st.acct[other].name}", pair["id"])
    for code in (r["pfc_detail"], r["pfc"]):
        c = (pfc or {}).get(code or "")
        if c:
            cat = c.most_common(1)[0][0]
            f, t, amt = shape(st, cat, acct, None, r["amount"])
            return Guess(name, cat, f, t, amt, "guess", "plaid",
                         f"Your other {_pfc_words(code)} entries are mostly {st.cat[cat].name}")
    cat = _by_name(st, r)
    if cat is not None:
        f, t, amt = shape(st, cat, acct, None, r["amount"])
        return Guess(name, cat, f, t, amt, "guess", "plaid", f"The bank calls it {_pfc_words(r['pfc_detail'] or r['pfc'])}")
    f, t, amt = shape(st, None, acct, None, r["amount"])
    return Guess(name, None, f, t, amt, "unknown", "none", "Nothing like it in your history yet")


def _pfc_words(code: Optional[str]) -> str:
    return (code or "uncategorized").replace("_", " ").lower()


def _transfer_category(st, a: int, b: int) -> Optional[int]:
    """The category your entries between these two accounts use most, else one named for the kind of transfer."""
    c = Counter(t.category_id for t in st.txns if {t.from_id, t.to_id} == {a, b} and t.category_id in st.cat
                and st.cat[t.category_id].type in ("Transfer", "Loan", "Saving"))
    if c:
        return c.most_common(1)[0][0]
    card = "card" in (st.acct[a].kind, st.acct[b].kind)
    for hint in (("credit card payment", "card payment") if card else ()) + ("between accounts", "transfer"):
        hit = next((x.id for x in st.categories if x.type == "Transfer" and hint in x.name.lower()), None)
        if hit:
            return hit
    return next((x.id for x in st.categories if x.type == "Transfer"), None)


# ---------- the inbox ----------

def inbox(bcon, st) -> list[dict]:
    """Posted rows on connected accounts that no entry stands for yet, each with its guess; pending ones follow
    without a guess (the bank can still change them)."""
    seen, pfc = history(bcon, st)
    mapped = _mapped(bcon, st)
    names = {r["id"]: r for r in bcon.execute("SELECT id, name, mask, tally_account_id, since FROM accounts")}
    rows = bcon.execute("SELECT * FROM txns WHERE status='new' ORDER BY pending, date DESC, id DESC").fetchall()
    fresh = [r for r in rows if not r["pending"]] + bcon.execute(
        "SELECT * FROM txns WHERE status='linked' AND pending=0").fetchall()
    out = []
    for r in rows:
        if r["account_id"] not in mapped or _before(r, names[r["account_id"]]["since"]):
            continue
        item = {"id": r["id"], "date": r["date"], "authorized_date": r["authorized_date"], "raw": r["raw"],
                "merchant": r["merchant"], "logo": r["logo"], "amount": r["amount"], "pending": bool(r["pending"]),
                "account_id": mapped[r["account_id"]], "bank_account": names[r["account_id"]]["name"],
                "guess": None}
        if not r["pending"]:
            g = guess(bcon, st, r, seen, pfc, mapped, fresh)
            item["guess"] = g.__dict__
        out.append(item)
    return out


def _before(r, since: Optional[str]) -> bool:
    """A row from before the inbox starts on its account: the audit shows it, the inbox doesn't."""
    return bool(since) and (r["authorized_date"] or r["date"]) < since


def waiting(bcon, st) -> int:
    """Posted rows the inbox would show."""
    mapped = _mapped(bcon, st)
    since = {r["id"]: r["since"] for r in bcon.execute("SELECT id, since FROM accounts")}
    return sum(1 for r in bcon.execute("SELECT account_id, date, authorized_date FROM txns WHERE status='new' AND "
                                       "pending=0") if r["account_id"] in mapped and not _before(r, since[r["account_id"]]))


def decide(bcon, bank_id: int, txn_id: Optional[int], how: str) -> None:
    status = "ignored" if how == "ignored" else "linked"
    bcon.execute("UPDATE txns SET status=?, txn_id=?, how=?, decided_at=? WHERE id=?",
                 (status, txn_id, how, _now(), bank_id))


# ---------- checking the ledger against the bank ----------

def audit(bcon, st, bank_account_id: int) -> dict:
    """For one connected account: the bank's balance against the ledger's, rows the ledger lacks, and entries in
    the bank's date range that no bank row stands for."""
    a = bcon.execute("SELECT * FROM accounts WHERE id=?", (bank_account_id,)).fetchone()
    acct = st.acct.get(a["tally_account_id"]) if a and a["tally_account_id"] else None
    if acct is None:
        return {"error": "Pick the Tally account this bank account is first."}
    rows = bcon.execute("SELECT * FROM txns WHERE account_id=? ORDER BY date", (a["id"],)).fetchall()
    posted = [r for r in rows if not r["pending"]]
    first = max(st.start, min((date.fromisoformat(r["date"]) for r in posted), default=st.today))
    linked = {r["txn_id"] for r in posted if r["status"] == "linked"}
    extra = [t for t in st.txns if acct.id in (t.from_id, t.to_id) and first <= t.date <= st.today
             and t.id not in linked]
    missing = [r for r in posted if r["status"] == "new" and date.fromisoformat(r["date"]) >= st.start]
    pending = sum(r["amount"] for r in rows if r["pending"])
    tally = st.expected(acct)
    return {"account_id": acct.id, "bank_account": a["name"], "first": first.isoformat(),
            "bank_balance": a["current"], "tally_balance": tally,
            "gap": (a["current"] - tally) if a["current"] is not None and tally is not None else None,
            "pending": pending, "balance_at": a["balance_at"],
            "matched": len([r for r in posted if r["status"] == "linked"]),
            "missing": [{"id": r["id"], "date": r["date"], "raw": r["raw"], "merchant": r["merchant"],
                         "amount": r["amount"]} for r in missing],
            "extra": [{"id": t.id, "date": t.date.isoformat(), "what": t.what, "amount": t.amount} for t in extra]}
