"""Activity's search box. Shortcuts are pulled out of the text and turned into filters:

    >100  >=100  <20  <=20   amount (either sign), in dollars, "$" and "," allowed
    aug  august  aug 2025    that month; without a year, the latest one up to this month
    today  yesterday         that day
    this week  last week     Sunday to Saturday
    this month  last month
    #trip                    that tag

What's left are words, and every one has to match the entry somewhere. Punctuation doesn't count ("trader joes"
finds Trader Joe's); a word of punctuation alone ("&") matches where it's written. A number matches the amount: with
cents (9.01) only that amount, whole (65) amounts of $65 and up whose dollars start with it ($65.40, $650), never the
cents ($20.65). Only the amount to the cent is an exact match: 65 is exactly $65.00. "-5" only refunds and other
negative amounts. "coffee >5 aug" is coffee entries over $5 in August."""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Optional
from .engine import cents, month_end, month_of

MONTHS = {name: i + 1 for i, names in enumerate(
    ("jan january", "feb february", "mar march", "apr april", "may", "jun june", "jul july", "aug august",
     "sep sept september", "oct october", "nov november", "dec december")) for name in names.split()}
AMOUNT = re.compile(r"(>=|<=|>|<)\$?(\d[\d,]{0,15}(?:\.\d{1,2})?)")  # 27+ digits overflowed cents() into a 500
NUMBER = re.compile(r"(-?)\$?(\d[\d,]{0,15}(?:\.\d{0,2})?|\.\d{1,2})")
PUNCT = re.compile(r"[^\w\s]")
EXACT, LOOSE = 2, 1  # how well a word matched: the amount itself, or somewhere


@dataclass
class Query:
    text: str = ""
    min: Optional[int] = None  # cents, inclusive
    max: Optional[int] = None
    first: Optional[date] = None
    last: Optional[date] = None
    tags: list[str] = field(default_factory=list)


def _span(word: str, unit: str, today: date) -> Optional[tuple[date, date]]:
    """"this week", "last month" and the like as first and last day."""
    if unit == "week":
        sunday = today - timedelta(days=(today.weekday() + 1) % 7)
        first = sunday - timedelta(days=7) if word == "last" else sunday
        return first, first + timedelta(days=6)
    if unit == "month":
        first = month_of(today)
        if word == "last":
            first = month_of(first - timedelta(days=1))
        return first, month_end(first)
    return None


def parse(q: str, today: date) -> Query:
    out, words = Query(), []
    tokens = q.lower().split()
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        nxt = tokens[i + 1] if i + 1 < len(tokens) else ""
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
            if re.fullmatch(r"(19|20)\d\d", nxt):
                y = int(nxt)
                i += 1
            else:
                y = today.year if mo <= today.month else today.year - 1
            out.first = date(y, mo, 1)
            out.last = month_end(out.first)
        elif tok in ("today", "yesterday"):
            out.first = out.last = today - timedelta(days=int(tok == "yesterday"))
        elif tok in ("this", "last") and (span := _span(tok, nxt, today)):
            out.first, out.last = span
            i += 1
        elif len(tok) > 1 and tok.startswith("#"):
            out.tags.append(tok[1:])
        else:
            words.append(tok)
        i += 1
    out.text = " ".join(words)
    return out


def plain(s: str) -> str:
    """Lowercase without punctuation, for matching words."""
    return PUNCT.sub("", s.lower())


@dataclass
class Word:
    raw: str  # as typed, lowercase
    text: str  # without punctuation; empty for a word of punctuation alone, which then matches as typed
    dollars: Optional[str] = None  # a whole number
    cents: Optional[int] = None  # a number with cents
    neg: bool = False


def words(text: str) -> list[Word]:
    out = []
    for w in text.lower().split():
        if n := NUMBER.fullmatch(w):
            num = n[2].replace(",", "").removesuffix(".")  # "5." is still the 5 being typed, not exactly $5.00
            out.append(Word(w, plain(w), dollars=None if "." in num else str(int(num)),
                            cents=cents(num) if "." in num else None, neg=bool(n[1])))
        else:
            # "$" or "&" alone used to drop out and leave no words, and no words matched every entry.
            out.append(Word(w, plain(w)))
    return out


def match(ws: list[Word], names: list[str], amount: int) -> int:
    """0 if some word matches nowhere, EXACT if a number is the amount itself, else LOOSE."""
    raw = [x.lower() for x in names]
    flat = [plain(x) for x in raw]
    best = LOOSE
    for w in ws:
        level = 0
        if w.dollars is not None or w.cents is not None:
            if not w.neg or amount < 0:
                if w.cents is not None:
                    level = EXACT if abs(amount) == w.cents else 0
                else:
                    d = str(abs(amount) // 100)
                    exact = d == w.dollars and abs(amount) % 100 == 0  # 6 is exactly $6.00, not $6.99
                    level = EXACT if exact else LOOSE if d.startswith(w.dollars) else 0
            if not level and any(w.raw in x for x in raw):
                level = LOOSE
        elif any(w.text in x for x in flat) if w.text else any(w.raw in x for x in raw):  # "&" in "A&W"
            level = LOOSE
        if not level:
            return 0
        best = max(best, level)
    return best
