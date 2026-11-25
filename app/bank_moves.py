"""Moves of money between two connected accounts (a card payment, checking to savings): which waiting bank rows are
the two sides of one move.

A row is one side of at most one move, so two $100 payments two days apart make two moves, not three entries. The
sides have opposite signs and the same size, sit on two different ledger accounts within PAIR_DAYS, and run the way
money runs between your own accounts: out of a cash account, into cash or a card. A purchase the bank is sure of (a
named merchant in a spending category) is never one side: a $50 grocery charge and an unrelated $50 deposit two days
later are a purchase and a deposit."""
from __future__ import annotations
import re
from datetime import date

PAIR_DAYS = 5  # days between the two sides of a transfer
SURE_PFC = ("VERY_HIGH", "HIGH")
MOVE_PFC = ("TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS")
_WORDS = re.compile(r"\b(PAYMENTS?|PMT|PYMT|TRANSFER|XFER|XFR|AUTOPAY|AUTO PAY|EPAY|THANK YOU)\b")


def day(r) -> date:
    return date.fromisoformat(r["authorized_date"] or r["date"])


def _conf(r):
    return r["pfc_conf"] if "pfc_conf" in r.keys() else None


def by_plaid(r) -> bool:
    """Plaid files it as a transfer, a loan payment or a card payment."""
    return any((c or "").startswith(MOVE_PFC) for c in (r["pfc_detail"], r["pfc"]))


def looks_like_move(r) -> bool:
    """Plaid's category or the bank's own words say it's money moving between accounts."""
    return by_plaid(r) or bool(_WORDS.search((r["raw"] or "").upper()))


def bought(r) -> bool:
    """A purchase the bank is sure of: a named merchant in a category that isn't a move of money."""
    return (bool(r["merchant"]) and _conf(r) in SURE_PFC and bool(r["pfc_detail"] or r["pfc"])
            and not by_plaid(r))


def pairs(rows, mapped: dict[int, int], kinds: dict[int, str]) -> dict[int, object]:
    """row id -> the row on the other side of the same move, among `rows` (posted rows still waiting). `mapped`:
    bank account -> ledger account; `kinds`: ledger account -> kind. Closest dates pair first."""
    by_size: dict[int, list] = {}
    for r in rows:
        if r["account_id"] in mapped and r["amount"] and not r["pending"] and not bought(r):
            by_size.setdefault(abs(r["amount"]), []).append(r)
    found = []
    for group in by_size.values():
        outs = [r for r in group if r["amount"] > 0]
        ins = [r for r in group if r["amount"] < 0]
        for o in outs:
            src = mapped[o["account_id"]]
            if kinds.get(src) != "cash":  # money leaves cash; a card doesn't pay into checking
                continue
            for i in ins:
                dst = mapped[i["account_id"]]
                gap = abs((day(o) - day(i)).days)
                if dst != src and kinds.get(dst) in ("cash", "card", "loan") and gap <= PAIR_DAYS:
                    found.append((gap, day(o), o["id"], i["id"], o, i))
    found.sort(key=lambda f: f[:4])
    out: dict[int, object] = {}
    for *_, o, i in found:
        if o["id"] not in out and i["id"] not in out:
            out[o["id"]], out[i["id"]] = i, o
    return out
