"""FastAPI app: the JSON API (api*.py), CSV exports, and the built React app (web/ → app/static/dist) at /.
The Jinja + HTMX pages were retired on 2026-09-18 (see git history before that date).
Run: uvicorn app.main:app --host 127.0.0.1 --port 8000"""
from __future__ import annotations
import csv, io, os
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from . import db, service
from .api import router as api_router
from .api_ops import router as ops_router
from .api_admin import router as admin_router
from .api_files import router as files_router
from .engine import month_of

app = FastAPI(title="Tally")
for r in (api_router, ops_router, admin_router, files_router):
    app.include_router(r)

DIST = "app/static/dist"


def state():
    return service.load(db.connect())


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


# ---------- single-page app ----------
@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    """Built files by name; anything else falls back to index.html so client-side routes deep-link.
    Hashed assets are immutable; index.html, sw.js and the manifest must always revalidate."""
    if path.startswith(("api/", "export/")):
        raise HTTPException(404)
    file = os.path.normpath(os.path.join(DIST, path))
    if path and file.startswith(DIST) and os.path.isfile(file):
        cache = "public, max-age=31536000, immutable" if path.startswith("assets/") else "no-cache"
        return FileResponse(file, headers={"Cache-Control": cache})
    if not os.path.isfile(f"{DIST}/index.html"):
        return HTMLResponse("<p>Frontend not built. Run <code>cd web && npm run build</code>.</p>", 503)
    return FileResponse(f"{DIST}/index.html", headers={"Cache-Control": "no-cache"})
