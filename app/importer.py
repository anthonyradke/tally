"""Import money.xlsx (Money + Log tabs) into an empty database, then verify every derived
cell on the Money tab against the engine. Run: python -m app.importer money.xlsx [db]"""
from __future__ import annotations
import sys
from datetime import date, datetime
from typing import Optional
import openpyxl
from . import db
from .engine import Txn, cents, month_table, month_range, month_of

BANK = {"Chase": "chase", "Amex": "amex", "SoFi": "sofi", "HSA": "hsa"}
CARD_WORDS = ("CC", "Card")
INVEST = {"Roth IRA (Schwab)": "Roth IRA", "401(k)": "401(k)", "HSA": "HSA"}


def _d(v) -> Optional[date]:
    if isinstance(v, datetime):
        return v.date()
    return v if isinstance(v, date) else None


def _kind(name: str) -> str:
    if name == "HSA":
        return "investment"
    return "card" if any(w in name for w in CARD_WORDS) else "cash"


def import_workbook(con, path: str, start_month: date = date(2026, 8, 1)) -> dict:
    if con.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]:
        raise SystemExit("Database already has transactions. Import only into an empty DB.")
    wb = openpyxl.load_workbook(path, data_only=True)
    log, money = wb["Log"], wb["Money"]

    # accounts: Log!M5:M11, starting balances Money!A123:C128
    starts = {money[f"A{r}"].value: cents(money[f"C{r}"].value or 0) for r in range(123, 129)}
    ids = {}
    for i in range(5, 12):
        name = log[f"M{i}"].value
        if not name:
            continue
        bank = next((b for k, b in BANK.items() if k in name), None)
        ef = int("HYSA" in name)
        cur = con.execute(
            "INSERT INTO accounts(name,kind,bank,start_balance,ef,sort) VALUES(?,?,?,?,?,?)",
            (name, _kind(name), bank, starts.get(name, 0), ef, i))
        ids[name] = cur.lastrowid
    for label, name in INVEST.items():
        if name not in ids:
            cur = con.execute("INSERT INTO accounts(name,kind,bank,sort) VALUES(?,?,?,?)",
                              (name, "investment", "hsa" if name == "HSA" else None, 20))
            ids[name] = cur.lastrowid
    # student loans: Money!C110:D111, blended like the sheet
    a, ra = money["C110"].value, money["D110"].value
    b, rb = money["C111"].value, money["D111"].value
    rate = (a * ra + b * rb) / (a + b)
    cur = con.execute("INSERT INTO accounts(name,kind,start_balance,loan_rate,sort) VALUES(?,?,?,?,?)",
                      ("Student loans", "loan", cents(a + b), rate, 30))
    ids["Student loans"] = cur.lastrowid

    # categories: Log!J5:K25
    cats = {}
    for i in range(5, 26):
        name, typ = log[f"J{i}"].value, log[f"K{i}"].value
        if name:
            cur = con.execute("INSERT INTO categories(name,type,sort) VALUES(?,?,?)", (name, typ, i))
            cats[name] = cur.lastrowid

    # transactions: Log!A5:F1004
    n = 0
    for r in log.iter_rows(min_row=5, max_row=log.max_row, max_col=6, values_only=True):
        d, what, cat, frm, to, amt = r
        if d is None:
            continue
        t = Txn(None, _d(d), (what or "").strip(), cats[cat],
                ids[frm] if frm else None, ids[to] if to else None, cents(amt))
        db.insert_txn(con, t)
        n += 1

    # typed balances: Money!AA:AC per month row, through the month the sheet fills to
    filled = _d(money["AJ4"].value) or date.today()
    for r in range(27, 80):
        m = _d(money[f"A{r}"].value)
        if not m or m > month_of(filled):
            continue
        for col, name in (("AA", "Roth IRA"), ("AB", "401(k)"), ("AC", "HSA")):
            v = money[f"{col}{r}"].value
            if isinstance(v, (int, float)):
                db.set_typed(con, ids[name], m, cents(v))
    db.set_setting(con, "start_month", start_month.isoformat())
    db.set_setting(con, "ef_months", str(money["C103"].value or 6))
    db.set_setting(con, "roth_limit", str(cents(money["C100"].value or 7500)))
    con.commit()
    return {"transactions": n, "accounts": len(ids), "categories": len(cats), "filled": filled}


def verify(con, path: str) -> list[str]:
    """Compare every derived Money-tab cell to the engine. Returns mismatch descriptions."""
    wb = openpyxl.load_workbook(path, data_only=True)
    money = wb["Money"]
    accounts, cats, txns, typed = (db.load_accounts(con), db.load_categories(con),
                                   db.load_txns(con), db.load_typed(con))
    filled = _d(money["AJ4"].value)
    start = date.fromisoformat(db.setting(con, "start_month"))
    rows = {r.month: r for r in month_table(accounts, cats, txns, typed, month_range(start, filled))}
    cat_id = {c.name: c.id for c in cats}
    acc_id = {a.name: a.id for a in accounts}
    headers = {c.column_letter: c.value for c in money[26]}
    fixed = {"B": "money_in", "Q": "spent", "R": "loan", "U": "left_over", "Z": "cash",
             "AD": "invested", "AH": "net_worth"}
    per_cat = {"S": "Roth IRA", "T": "HYSA Transfer"}
    per_acct = {"V": "Chase Checking", "W": "SoFi Checking", "X": "Amex HYSA", "Y": "SoFi HYSA",
                "AA": "Roth IRA", "AB": "401(k)", "AC": "HSA", "AE": "Chase CC", "AF": "Amex CC",
                "AG": "Student loans"}
    bad, checked = [], 0
    for r in range(27, 80):
        m = _d(money[f"A{r}"].value)
        if not m or m not in rows:
            continue
        row = rows[m]
        expect = {}
        for col, attr in fixed.items():
            expect[col] = getattr(row, attr)
        for col, name in per_cat.items():
            expect[col] = row.by_category.get(cat_id[name], 0)
        for col, name in per_acct.items():
            expect[col] = row.balances[acc_id[name]]
        for col in "CDEFGHIJKLMNOP":
            h = headers[col]
            if h in cat_id:
                expect[col] = row.by_category.get(cat_id[h], 0)
        for col, want in expect.items():
            v = money[f"{col}{r}"].value
            got = cents(v) if isinstance(v, (int, float)) else None
            checked += 1
            if got != want:
                bad.append(f"{col}{r} {headers.get(col)} {m:%b %Y}: sheet {got} engine {want}")
    bad.insert(0, f"checked {checked} cells") if not bad else None
    return bad


if __name__ == "__main__":
    xlsx = sys.argv[1]
    con = db.connect(sys.argv[2] if len(sys.argv) > 2 else None)
    print(import_workbook(con, xlsx))
    for line in verify(con, xlsx):
        print(line)
