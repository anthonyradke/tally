"""Pending bank rows, shown in Activity the way a banking app shows them: dimmed at the top until the bank posts them.

Read only. A pending row never becomes an entry by itself (the bank can still change or drop it); once it posts, the
posted copy goes through the inbox as usual (it keeps any decision through `pending_transaction_id`) and the pending
one is gone from here.

Each row reads like the entry it would most likely become, so the app can show it with an entry's looks:
  - `what`: the inbox's name for it (as you filed the same merchant before, else the bank's merchant, counterparty
    or cleaned description; bank.guess).
  - `category_id`: the inbox's guess, or null.
  - `type`: the guessed category's type; without one, money out is "Spending" and money into a cash account
    "Money in" (on a card, money in is a refund: negative "Spending").
  - `amount`: cents, signed as an entry of that type carries it: spending positive (a refund negative), money in
    positive, a move positive. `from_id`/`to_id`: the entry's accounts (one of them is `account_id`).
"""
from __future__ import annotations
from typing import Optional

from . import bank


def _plain(st, acct: int, plaid_amount: int) -> tuple[str, Optional[int], Optional[int], int]:
    """(type, from, to, amount) for a row nothing in the history or the bank's category explains."""
    if plaid_amount < 0 and st.acct[acct].kind == "cash":
        return "Money in", None, acct, -plaid_amount
    return "Spending", acct, None, plaid_amount


def pending(bcon, st) -> list[dict]:
    """Pending rows on connected accounts mapped to a ledger account, newest first. $0 holds (a card check) and rows
    from before the inbox starts on their account are left out."""
    mapped = bank._mapped(bcon, st)
    since = {r["id"]: r["since"] for r in bcon.execute("SELECT id, since FROM accounts")}
    rows = [r for r in bcon.execute("SELECT * FROM txns WHERE status='new' AND pending=1 AND amount != 0 "
                                    "ORDER BY COALESCE(authorized_date, date) DESC, id DESC")
            if r["account_id"] in mapped and not bank._before(r, since.get(r["account_id"]))]
    if not rows:
        return []
    seen, pfc = bank.history(bcon, st)
    out = []
    for r in rows:
        acct = mapped[r["account_id"]]
        # No pairing with other rows: a move's other side is posted or pending on its own schedule.
        g = bank.guess(bcon, st, r, seen, pfc, mapped, {})
        if g.category_id in st.cat:
            kind, f, t, amt = st.cat[g.category_id].type, g.from_id, g.to_id, g.amount
        else:
            kind, f, t, amt = _plain(st, acct, r["amount"])
        out.append({"id": r["id"], "date": r["authorized_date"] or r["date"], "what": g.what or bank.name_for(r),
                    "category_id": g.category_id if g.category_id in st.cat else None, "type": kind,
                    "amount": amt, "from_id": f, "to_id": t, "account_id": acct, "raw": r["raw"],
                    "merchant": r["merchant"], "logo": r["logo"], "website": r["website"]})
    return out
