"""FastAPI routes. HTMX + Jinja, no build step. Run: uvicorn app.main:app --host 0.0.0.0"""
from __future__ import annotations
import csv, io
from datetime import date
from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from . import db, service
from .engine import dollars, month_of, cents, Txn

app = FastAPI(title="Money")
app.mount("/static", StaticFiles(directory="app/static"), name="static")
tpl = Jinja2Templates(directory="app/templates")
tpl.env.filters["money"] = dollars
tpl.env.filters["mon"] = lambda m: m.strftime("%b %Y")
tpl.env.globals["today"] = date.today


def render(name, request, **ctx):
    ctx.update(request=request, dollars=dollars)
    st = ctx.get("st")
    if st:
        ctx["default_cat"] = next((c.id for c in st.categories if c.type == "Spending"), None)
    return tpl.TemplateResponse(request, name, ctx)


def state():
    return service.load(db.connect())


def back(url="/"):
    return RedirectResponse(url, status_code=303)


# ---------- log ----------
@app.get("/", response_class=HTMLResponse)
def log(request: Request, edit: int = 0, error: str = ""):
    st = state()
    favs = st.con.execute("SELECT * FROM favorites ORDER BY sort, id").fetchall()
    editing = next((t for t in st.txns if t.id == edit), None)
    return render("log.html", request, st=st, favs=favs, editing=editing, errors=[])


@app.post("/txn", response_class=HTMLResponse)
async def add_txn(request: Request):
    st = state()
    t = service.txn_from_form(await request.form())
    errs = service.save_txn(st.con, st, t)
    if errs:
        favs = st.con.execute("SELECT * FROM favorites ORDER BY sort, id").fetchall()
        return render("log.html", request, st=st, favs=favs, editing=t, errors=errs)
    return back("/")


@app.post("/txn/{txn_id}", response_class=HTMLResponse)
async def edit_txn(request: Request, txn_id: int):
    st = state()
    t = service.txn_from_form(await request.form(), txn_id)
    errs = service.save_txn(st.con, st, t)
    if errs:
        favs = st.con.execute("SELECT * FROM favorites ORDER BY sort, id").fetchall()
        return render("log.html", request, st=st, favs=favs, editing=t, errors=errs)
    return back("/")


@app.post("/txn/{txn_id}/delete")
def delete_txn(txn_id: int):
    con = db.connect()
    con.execute("DELETE FROM transactions WHERE id=?", (txn_id,))
    con.commit()
    return back("/")


# ---------- balances + reconcile ----------
@app.get("/balances", response_class=HTMLResponse)
def balances(request: Request):
    st = state()
    goal, progress = st.ef()
    return render("balances.html", request, st=st, goal=goal, progress=progress,
                  roth_limit=int(db.setting(st.con, "roth_limit")))


@app.post("/reconcile/{account_id}", response_class=HTMLResponse)
def reconcile(request: Request, account_id: int, actual: str = Form(...), save: str = Form("")):
    st = state()
    a = st.acct[account_id]
    d = st.diagnose(a, cents(actual))
    if save:
        st.con.execute("INSERT INTO reconciliations(account_id,date,actual,expected) VALUES(?,?,?,?)",
                       (a.id, st.today.isoformat(), d.actual, d.expected))
        st.con.commit()
    return render("_reconcile.html", request, st=st, a=a, d=d, saved=bool(save))


# ---------- months ----------
@app.get("/months", response_class=HTMLResponse)
def months(request: Request):
    st = state()
    spending = [c for c in st.categories if c.type == "Spending"]
    return render("months.html", request, st=st, spending=spending)


# ---------- month-end ----------
@app.get("/month-end", response_class=HTMLResponse)
@app.get("/month-end/{ym}", response_class=HTMLResponse)
def month_end(request: Request, ym: str = ""):
    st = state()
    m = date.fromisoformat(ym + "-01") if ym else month_of(st.today)
    if m == month_of(st.today) and len(st.months) > 1 and not ym:
        m = st.months[-2] if st.today.day <= 10 else m   # early in a month, default to the one that just ended
    return render("month_end.html", request, st=st, mo=m, status=st.month_end_status(m))


@app.post("/month-end/{ym}/typed")
async def month_end_typed(request: Request, ym: str):
    con = db.connect()
    m = date.fromisoformat(ym + "-01")
    for k, v in (await request.form()).items():
        if k.startswith("acct_") and v.strip():
            db.set_typed(con, int(k[5:]), m, cents(v))
    con.commit()
    return back(f"/month-end/{ym}")


@app.post("/month-end/{ym}/interest")
async def month_end_interest(request: Request, ym: str):
    st = state()
    m = date.fromisoformat(ym + "-01")
    income = next(c.id for c in st.categories if c.name == "Other Income")
    from .engine import month_end as eom
    for k, v in (await request.form()).items():
        if k.startswith("acct_") and v.strip() and cents(v):
            aid = int(k[5:])
            db.insert_txn(st.con, Txn(None, eom(m), f"{st.acct[aid].name} interest", income, None, aid, cents(v)))
    st.con.commit()
    return back(f"/month-end/{ym}")


# ---------- settings ----------
@app.get("/settings", response_class=HTMLResponse)
def settings(request: Request):
    st = state()
    all_accounts = st.con.execute("SELECT * FROM accounts ORDER BY sort, id").fetchall()
    all_cats = st.con.execute("SELECT * FROM categories ORDER BY sort, id").fetchall()
    favs = st.con.execute("SELECT * FROM favorites ORDER BY sort, id").fetchall()
    keys = {k: db.setting(st.con, k) for k in ("start_month", "ef_months", "roth_limit")}
    return render("settings.html", request, st=st, accounts=all_accounts, cats=all_cats,
                  favs=favs, keys=keys)


@app.post("/settings/account")
async def save_account(request: Request):
    f = await request.form()
    con = db.connect()
    vals = (f["name"].strip(), f["kind"], f.get("bank") or None, cents(f.get("start_balance") or 0),
            float(f["apy"]) / 100 if f.get("apy") else None,
            float(f["loan_rate"]) / 100 if f.get("loan_rate") else None,
            int(bool(f.get("ef"))), int(f.get("sort") or 0), int(bool(f.get("active"))))
    if f.get("id"):
        con.execute("UPDATE accounts SET name=?,kind=?,bank=?,start_balance=?,apy=?,loan_rate=?,"
                    "ef=?,sort=?,active=? WHERE id=?", vals + (int(f["id"]),))
    else:
        con.execute("INSERT INTO accounts(name,kind,bank,start_balance,apy,loan_rate,ef,sort,active)"
                    " VALUES(?,?,?,?,?,?,?,?,?)", vals)
    con.commit()
    return back("/settings")


@app.post("/settings/category")
async def save_category(request: Request):
    f = await request.form()
    con = db.connect()
    vals = (f["name"].strip(), f["type"], int(f.get("sort") or 0), int(bool(f.get("active"))))
    if f.get("id"):
        con.execute("UPDATE categories SET name=?,type=?,sort=?,active=? WHERE id=?", vals + (int(f["id"]),))
    else:
        con.execute("INSERT INTO categories(name,type,sort,active) VALUES(?,?,?,?)", vals)
    con.commit()
    return back("/settings")


@app.post("/settings/favorite")
async def save_favorite(request: Request):
    f = await request.form()
    con = db.connect()
    if f.get("delete"):
        con.execute("DELETE FROM favorites WHERE id=?", (int(f["id"]),))
    else:
        con.execute("INSERT INTO favorites(label,category_id,from_account_id,to_account_id,amount,sort)"
                    " VALUES(?,?,?,?,?,?)",
                    (f["label"].strip(), int(f["category_id"]), int(f["from_account_id"]) or None,
                     int(f.get("to_account_id") or 0) or None,
                     cents(f["amount"]) if f.get("amount") else None, int(f.get("sort") or 0)))
    con.commit()
    return back("/settings")


@app.post("/settings/keys")
async def save_keys(request: Request):
    f = await request.form()
    con = db.connect()
    db.set_setting(con, "start_month", f["start_month"])
    db.set_setting(con, "ef_months", str(int(f["ef_months"])))
    db.set_setting(con, "roth_limit", str(cents(f["roth_limit"])))
    con.commit()
    return back("/settings")


# ---------- export ----------
def _csv(rows, name):
    buf = io.StringIO()
    csv.writer(buf).writerows(rows)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={name}"})


@app.get("/export/log.csv")
def export_log():
    st = state()
    rows = [["Date", "What it was", "Category", "From account", "To account", "Amount", "Month", "Type"]]
    for t in sorted(st.txns, key=lambda t: (t.date, t.id)):
        c = st.cat[t.category_id]
        rows.append([t.date, t.what, c.name, st.acct[t.from_id].name if t.from_id else "",
                     st.acct[t.to_id].name if t.to_id else "", t.amount / 100, month_of(t.date), c.type])
    return _csv(rows, "log.csv")


@app.get("/export/months.csv")
def export_months():
    st = state()
    head = ["Month", "Money in"] + [c.name for c in st.categories if c.type == "Spending"] + \
           ["TOTAL SPENT", "Loan payments", "Saving", "LEFT OVER"] + [a.name for a in st.accounts] + \
           ["TOTAL CASH", "TOTAL INVESTED", "NET WORTH"]
    rows = [head]
    for r in st.rows:
        rows.append([r.month, r.money_in / 100] +
                    [r.by_category.get(c.id, 0) / 100 for c in st.categories if c.type == "Spending"] +
                    [r.spent / 100, r.loan / 100, r.saving / 100, r.left_over / 100] +
                    [r.balances[a.id] / 100 for a in st.accounts] +
                    [r.cash / 100, r.invested / 100, r.net_worth / 100])
    return _csv(rows, "months.csv")
