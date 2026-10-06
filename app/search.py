"""Shortcuts in Activity's search box. Words are matched as before; these are pulled out and turned into filters:

    >100  >=100  <20  <=20   amount (either sign), in dollars, "$" and "," allowed
    aug  august  aug 2025    that month; without a year, the latest one up to this month
    #trip                    that tag

"coffee >5 aug" is coffee entries over $5 in August."""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Optional
from .engine import cents, month_end

MONTHS = {name: i + 1 for i, names in enumerate(
    ("jan january", "feb february", "mar march", "apr april", "may", "jun june", "jul july", "aug august",
     "sep sept september", "oct october", "nov november", "dec december")) for name in names.split()}
AMOUNT = re.compile(r"(>=|<=|>|<)\$?(\d[\d,]*(?:\.\d{1,2})?)")


@dataclass
class Query:
    text: str = ""
    min: Optional[int] = None  # cents, inclusive
    max: Optional[int] = None
    first: Optional[date] = None
    last: Optional[date] = None
    tags: list[str] = field(default_factory=list)


def parse(q: str, today: date) -> Query:
    out, words = Query(), []
    tokens = q.lower().split()
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if m := AMOUNT.fullmatch(tok):
            c = cents(m[2].replace(",", ""))
            if m[1] == ">":
                out.min = c + 1
            elif m[1] == ">=":
                out.min = c
            elif m[1] == "<":
                out.max = c - 1
            else:
                out.max = c
        elif tok in MONTHS:
            mo = MONTHS[tok]
            if i + 1 < len(tokens) and re.fullmatch(r"(19|20)\d\d", tokens[i + 1]):
                y = int(tokens[i + 1])
                i += 1
            else:
                y = today.year if mo <= today.month else today.year - 1
            out.first = date(y, mo, 1)
            out.last = month_end(out.first)
        elif len(tok) > 1 and tok.startswith("#"):
            out.tags.append(tok[1:])
        else:
            words.append(tok)
        i += 1
    out.text = " ".join(words)
    return out
