"""Parsing request bodies and query values for the JSON routes. Anything malformed is a 422 with words the app can
show; it used to surface as a 500 ("Request failed") from whichever int() or cents() tripped first."""
from __future__ import annotations
import re
from datetime import date
from typing import Any, NoReturn, Optional
from fastapi import HTTPException, Request
from .engine import cents

MAX_CENTS = 10**12  # $10 billion: past any real figure, well inside SQLite's 64-bit integers


def bad(msg: str) -> NoReturn:
    raise HTTPException(422, {"errors": [msg]})


async def body(request: Request) -> dict:
    try:
        b = await request.json()
    except ValueError:
        bad("The request wasn't valid JSON.")
    if not isinstance(b, dict):
        bad("The request should be a JSON object.")
    return b


def money(v: Any, what: str = "Amount") -> int:
    """Dollars (number or numeric string) to cents."""
    if isinstance(v, bool) or not isinstance(v, (int, float, str)):
        bad(f"{what} must be a number.")
    try:
        c = cents(v)
    except (ArithmeticError, ValueError):
        bad(f"{what} must be a number.")
    if abs(c) > MAX_CENTS:
        bad(f"{what} is too large.")
    return c


def whole(v: Any, what: str) -> int:
    if isinstance(v, int) and not isinstance(v, bool) and abs(v) < 2**62:
        return v
    if isinstance(v, float) and v.is_integer() and abs(v) < 2**53:
        return int(v)
    if isinstance(v, str) and re.fullmatch(r"\s*-?\d{1,18}\s*", v):
        return int(v)
    bad(f"{what} must be a whole number.")


def opt_id(v: Any, what: str) -> Optional[int]:
    """An optional reference: blank, null or 0 mean none."""
    return None if v in (None, "", 0, "0") else whole(v, what)


def number(v: Any, what: str) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float, str)):
        bad(f"{what} must be a number.")
    try:
        f = float(v)
    except ValueError:
        bad(f"{what} must be a number.")
    if f != f or f in (float("inf"), float("-inf")) or abs(f) > 1e9:
        bad(f"{what} must be a number.")
    return f


def text(v: Any, what: str) -> str:
    if v is None:
        return ""
    if not isinstance(v, str):
        bad(f"{what} must be text.")
    return v.strip()


def opt_text(v: Any, what: str) -> Optional[str]:
    return text(v, what) or None


def flag(v: Any, what: str) -> int:
    if isinstance(v, bool) or v in (0, 1):
        return int(v)
    bad(f"{what} must be true or false.")


def day(v: Any, what: str = "Date") -> date:
    if isinstance(v, str):
        try:
            return date.fromisoformat(v.strip())
        except ValueError:
            pass
    bad(f"{what} must be a date like 2026-09-24.")


def month(ym: str) -> date:
    """A 'YYYY-MM' path segment."""
    m = re.fullmatch(r"(\d{4})-(\d{2})", ym)
    if not m or not 1 <= int(m[2]) <= 12:
        bad("The month must look like 2026-09.")
    return date(int(m[1]), int(m[2]), 1)


def ids(v: Any, what: str = "ids") -> list[int]:
    if not isinstance(v, list):
        bad(f"{what} must be a list.")
    return [whole(x, what) for x in v]


def words(v: Any, what: str = "Tags") -> list[str]:
    """Tags as a list of strings or one space-separated string."""
    if v is None:
        return []
    if isinstance(v, str):
        return v.split()
    if isinstance(v, list) and all(isinstance(x, str) for x in v):
        return v
    bad(f"{what} must be text.")
