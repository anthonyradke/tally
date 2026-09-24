"""FastAPI app: the JSON API (api*.py) and CSV exports. The iPhone app in ios/ is the only client.
The web apps were retired: Jinja + HTMX on 2026-09-18, the React PWA on 2026-09-24 (see git history).
Run: uvicorn app.main:app --host 127.0.0.1 --port 8000"""
from __future__ import annotations
import csv, io
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from . import service
from .api import Con, router as api_router
from .api_ops import router as ops_router
from .api_admin import router as admin_router
from .api_files import router as files_router
from .api_recurring import router as recurring_router
from .engine import month_of

app = FastAPI(title="Tally")
for r in (api_router, ops_router, admin_router, recurring_router, files_router):
    app.include_router(r)


# ---------- export ----------
def _csv(rows, name):
    buf = io.StringIO()
    csv.writer(buf).writerows(rows)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={name}"})


@app.get("/export/log.csv")
def export_log(con: Con):
    st = service.load(con)
    rows = [["Date", "What it was", "Category", "From account", "To account", "Amount", "Month", "Type"]]
    for t in sorted(st.txns, key=lambda t: (t.date, t.id)):
        c = st.cat[t.category_id]
        rows.append([t.date, t.what, c.name, st.acct[t.from_id].name if t.from_id else "",
                     st.acct[t.to_id].name if t.to_id else "", t.amount / 100, month_of(t.date), c.type])
    return _csv(rows, "log.csv")


@app.get("/export/months.csv")
def export_months(con: Con):
    st = service.load(con)
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

