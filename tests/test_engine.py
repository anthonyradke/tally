from datetime import date
from app.engine import (Account, Category, Txn, balances, month_table, validate, diagnose,
                        emergency_fund, month_range, cents, propose_interest)

CHK = Account(1, "Chase Checking", "cash", cents("1000"))
CC = Account(2, "Chase CC", "card", cents("100"))
HSA = Account(3, "HSA", "investment", 0)
LOAN = Account(4, "Student loans", "loan", cents("14929.52"), loan_rate=0.0528)
ACCTS = [CHK, CC, HSA, LOAN]
CATS = [Category(1, "Paycheck", "Money in"), Category(2, "Groceries", "Spending"),
        Category(3, "Credit Card Payment", "Transfer"), Category(4, "Health", "Spending"),
        Category(5, "Student Loan Payment", "Loan"), Category(6, "HYSA Transfer", "Saving")]
AUG, SEP = date(2026, 8, 1), date(2026, 9, 1)
MONTHS = [AUG, SEP]


def tx(d, cat, frm, to, amt, i=None):
    return Txn(i, d, "", cat, frm, to, cents(amt))


def test_cash_and_card_mirror():
    txns = [tx(date(2026, 8, 5), 1, None, 1, "500"),      # paycheck in
            tx(date(2026, 8, 6), 2, 2, None, "40"),       # groceries on card
            tx(date(2026, 8, 7), 3, 1, 2, "100"),         # pay the card
            tx(date(2026, 8, 8), 2, 1, None, "-10")]      # refund to checking
    b = balances(ACCTS, txns, {}, MONTHS)
    assert b[AUG][1] == cents("1410")
    assert b[AUG][2] == cents("40")
    assert b[SEP][1] == cents("1410")   # carries forward


def test_investment_typed_and_hsa_swipe_does_not_move_it():
    txns = [tx(date(2026, 8, 9), 4, 3, None, "25")]
    typed = {(3, AUG): cents("700")}
    b = balances(ACCTS, txns, typed, MONTHS)
    assert b[AUG][3] == cents("700")
    assert b[SEP][3] == cents("700")   # carried, no Sept typed value
    rows = month_table(ACCTS, CATS, txns, typed, MONTHS)
    assert rows[0].spent == cents("25")  # still counts as Health spending


def test_loan_amortizes_like_the_sheet():
    b = balances(ACCTS, [], {}, MONTHS)
    # blended 5.28% rate on the sheet; Aug value in the workbook is 14995.27
    rate = (8629.36 * 0.055 + 6300.16 * 0.0499) / 14929.52
    b = balances([Account(4, "L", "loan", cents("14929.52"), loan_rate=rate)], [], {}, MONTHS)
    assert b[AUG][4] == cents("14995.27")
    assert b[SEP][4] == cents("15061.31")
    pay = [tx(date(2026, 9, 3), 5, 1, 4, "1000")]
    b = balances([CHK, Account(4, "L", "loan", cents("14929.52"), loan_rate=rate)], pay, {}, MONTHS)
    assert b[SEP][4] == cents("14061.31")


def test_month_table_left_over_and_net_worth():
    txns = [tx(date(2026, 8, 5), 1, None, 1, "500"), tx(date(2026, 8, 6), 2, 2, None, "40"),
            tx(date(2026, 8, 7), 6, 1, None, "50")]
    r = month_table(ACCTS, CATS, txns, {}, MONTHS)[0]
    assert (r.money_in, r.spent, r.saving, r.left_over) == (50000, 4000, 5000, 41000)
    assert r.net_worth == r.cash + r.invested - r.cards - r.loans


def test_validation_shapes():
    accts = {a.id: a for a in ACCTS}
    bad = tx(date(2026, 9, 14), 1, 1, None, "151.90")       # the 9/17 mistake
    assert any("To is required" in e for e in validate(bad, "Money in", accts))
    assert any("From must be blank" in e for e in validate(bad, "Money in", accts))
    good = tx(date(2026, 9, 14), 1, None, 1, "151.90")
    assert validate(good, "Money in", accts) == []
    assert validate(tx(date(2026, 9, 1), 3, 1, None, "5"), "Transfer", accts)
    assert validate(tx(date(2026, 9, 1), 3, 1, 1, "5"), "Transfer", accts)
    assert validate(tx(date(2026, 9, 1), 2, 1, None, "0"), "Spending", accts)


def test_diagnose_finds_double_and_future():
    wrong = tx(date(2026, 9, 14), 1, 1, None, "151.90", i=7)   # income routed From
    future = tx(date(2026, 9, 28), 2, 1, None, "240.88", i=8)
    txns = [wrong, future]
    as_of = date(2026, 9, 17)
    # truth: checking should be 1000 + 151.90
    d = diagnose(CHK, ACCTS, txns, {}, AUG, as_of, cents("1151.90"))
    assert d.expected == cents("848.10")
    assert d.gap == cents("303.80")
    assert [t.id for t in d.doubled] == [7]
    assert [t.id for t in d.future] == [8]


def test_emergency_fund_uses_completed_months_only():
    txns = [tx(date(2026, 8, 6), 2, 2, None, "600"), tx(date(2026, 9, 6), 2, 2, None, "10")]
    hysa = Account(5, "SoFi HYSA", "cash", cents("1"), ef=True)
    rows = month_table(ACCTS + [hysa], CATS, txns, {}, MONTHS)
    goal, progress = emergency_fund(rows, ACCTS + [hysa], 6, date(2026, 9, 17))
    assert goal == cents("3600")
    assert progress == cents("1")


def test_helpers():
    assert month_range(date(2026, 8, 15), date(2026, 10, 2)) == [AUG, SEP, date(2026, 10, 1)]
    assert cents("12.345") == 1235 and cents(-170) == -17000
    assert propose_interest(cents("10000"), 0.031) == cents("25.83")
