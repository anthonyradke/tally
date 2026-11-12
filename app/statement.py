"""Bank statement CSVs for reconcile: read the lines of an export from a bank or card site, then pair each with an
entry on that account. Banks lay these files out differently, so the columns are found by their headers: a date
("Date", "Posting Date", "Transaction Date"), a description, and either one amount or separate debit and credit
columns. Signs differ too (a card's export may list a purchase as positive or negative), so lines pair with entries
by size and date, and the sign is only used to say which way the money went."""
from __future__ import annotations
import csv
import io
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Optional

DATE_HEADS = ("transaction date", "trans. date", "trans date", "posting date", "posted date", "post date", "date")
TEXT_HEADS = ("description", "payee", "merchant", "name", "details", "memo", "transaction")
AMOUNT_HEADS = ("amount", "transaction amount")
DEBIT_HEADS = ("debit", "withdrawal", "withdrawals", "money out", "charges")
CREDIT_HEADS = ("credit", "deposit", "deposits", "money in", "payments")
FORMATS = ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y", "%m-%d-%Y", "%d %b %Y", "%b %d, %Y")
WINDOW = 3  # days a bank's posting date may differ from the day the entry was made for
MAX_LINES = 2000


@dataclass
class Line:
    n: int  # line number in the file (1 = the header)
    date: date
    what: str
    amount: int  # cents, as the file signed it


def _find(head: list[str], names: tuple[str, ...]) -> Optional[int]:
    for name in names:  # in order of preference: "Transaction Date" over "Posting Date"
        for i, h in enumerate(head):
            if h == name:
                return i
    for name in names:
        for i, h in enumerate(head):
            if name in h:
                return i
    return None


def _date(v: str) -> Optional[date]:
    v = v.strip()
    for f in FORMATS:
        try:
            return datetime.strptime(v, f).date()
        except ValueError:
            pass
    return None


def _cents(v: str) -> Optional[int]:
    v = v.strip().replace("$", "").replace(",", "").replace(" ", "")
    if not v:
        return None
    neg = v.startswith("(") and v.endswith(")")
    v = v.strip("()")
    if v.endswith("-"):  # "12.34-"
        neg, v = True, v[:-1]
    if not re.fullmatch(r"[+-]?\d{1,12}(\.\d{1,2})?", v):
        return None
    try:
        c = int((Decimal(v) * 100).to_integral_value())
    except InvalidOperation:
        return None
    return -c if neg else c


def parse(text: str) -> list[Line]:
    """The statement's lines. Raises ValueError with words the app can show when the columns can't be found."""
    rows = list(csv.reader(io.StringIO(text.lstrip("﻿"))))
    for h, row in enumerate(rows[:10]):  # some exports start with a title line or two
        head = [c.strip().lower() for c in row]
        d, a = _find(head, DATE_HEADS), _find(head, AMOUNT_HEADS)
        dr, cr = _find(head, DEBIT_HEADS), _find(head, CREDIT_HEADS)
        if d is not None and (a is not None or dr is not None or cr is not None):
            break
    else:
        raise ValueError("Couldn't find the date and amount columns. Export the statement as CSV.")
    t = _find(head, TEXT_HEADS)
    out: list[Line] = []
    for n, row in enumerate(rows[h + 1:], start=h + 2):
        if len(out) >= MAX_LINES:
            raise ValueError(f"That's more than {MAX_LINES:,} lines. Export a shorter range.")
        cell = lambda i, row=row: row[i] if i is not None and i < len(row) else ""
        day = _date(cell(d))
        if day is None:
            continue  # a blank line, a running total, a footer
        if a is not None:
            amount = _cents(cell(a))
        else:
            debit, credit = _cents(cell(dr)), _cents(cell(cr))
            amount = (abs(credit) if credit else 0) - (abs(debit) if debit else 0) if (debit or credit) else None
        if amount:
            out.append(Line(n, day, cell(t).strip(), amount))
    if not out:
        raise ValueError("The file has no lines with a date and an amount.")
    return out


def match(lines: list[Line], entries: list, account_id: int) -> dict:
    """Pairs each line with one entry on the account of the same size within WINDOW days, nearest date first.
    `entries` are engine Txns (posted ones). Returns matched pairs, lines with no entry (missing from Tally) and
    entries in the statement's dates with no line (in Tally, not on the statement)."""
    first, last = min(x.date for x in lines), max(x.date for x in lines)
    near = [t for t in entries if account_id in (t.from_id, t.to_id)
            and first - timedelta(days=WINDOW) <= t.date <= last + timedelta(days=WINDOW)]
    free = {t.id: t for t in near}
    pairs, missing = [], []
    # Exact dates first, then a day off, and so on: a $4.50 coffee every day pairs with its own day.
    order = sorted(lines, key=lambda x: (x.date, x.n))
    left = list(order)
    for gap in range(WINDOW + 1):
        still = []
        for x in left:
            hit = next((t for t in sorted(free.values(), key=lambda t: (t.date, t.id))
                        if abs(t.amount) == abs(x.amount) and abs((t.date - x.date).days) == gap), None)
            if hit:
                pairs.append((x, hit))
                del free[hit.id]
            else:
                still.append(x)
        left = still
    missing = left
    extra = [t for t in free.values() if first <= t.date <= last]
    return {"first": first, "last": last, "pairs": sorted(pairs, key=lambda p: (p[0].date, p[0].n)),
            "missing": missing, "extra": sorted(extra, key=lambda t: (t.date, t.id))}
