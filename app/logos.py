"""Logos for entries and accounts, fetched once and kept in TALLY_LOGOS (default data/logos).

Where a logo comes from, surest first:
  1. The bank: Plaid's own merchant logo or website on a bank row with the same merchant, or on the row paired with
     an entry of that name; for a bank or an account, Plaid's logo for the institution, else its website.
  2. The name as a website: "Chipotle" is chipotle.com, "King Soopers" kingsoopers.com, looked up on logo.dev
     (LOGO_DEV_KEY, a publishable key) with fallback=404, so a name that isn't a site has no logo.
Never logo.dev's best-match name search: it always answers, and a local shop got a stranger's logo.

Words that only describe ("Paycheck", "Rent", "Gas") are never looked up, and a logo shown wrong can be hidden for good
(`hide`). A miss is remembered for a month, then tried again (the bank may have learned the merchant since). Only a
real answer is a miss (logo.dev's 404, a page that isn't an image, or no source at all): a timeout, a 429 or 5xx, a
network error or the time budget running out waits ten minutes, and without LOGO_DEV_KEY nothing is remembered.
One lookup per name at a time (`resolve` holds a lock per logo), within BUDGET seconds for all its sources.
"""
from __future__ import annotations
import base64
import hashlib
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import weakref
from pathlib import Path
from typing import Callable, Optional, Union
from .logo_color import brand_color, washes  # noqa: F401 (washes: for api_logos)

MISS_DAYS = 30
WAIT_SECONDS = 600  # after a failure that says nothing about the logo (timeout, 429, 5xx, offline)
BUDGET = 3.0  # seconds for all of one logo's sources; a request used to wait up to 6 s per source
SIZE = 128
GENERIC = set("""
rent paycheck payroll salary income interest dividend transfer payment payments refund refunds deposit withdrawal cash
atm fee fees tax taxes tip tips gift gifts groceries grocery gas fuel charging dinner lunch breakfast coffee drinks
parking toll tolls utilities utility bill bills insurance mortgage loan loans savings saving checking credit debit
card home phone internet water sewer trash electric power haircut doctor dentist vet pharmacy medicine misc other
mom dad lex reimbursement repayment paid back owed lent borrowed allowance bonus contract freelance liquor store
mobile dining out online to autopay pmt eleven
""".split())
# The name a ledger or a bank uses, where the brand's site isn't simply the name with ".com".
DOMAINS = {
    "amex": "americanexpress.com", "american express": "americanexpress.com", "wells": "wellsfargo.com",
    "wells fargo": "wellsfargo.com", "schwab": "schwab.com", "charles schwab": "schwab.com", "x": "x.com",
    "x money": "x.com", "steam": "steampowered.com", "xcel": "xcelenergy.com", "vasa": "vasafitness.com",
    "apple": "apple.com", "icloud": "apple.com", "app store": "apple.com", "walmart": "walmart.com",
    "whole foods": "wholefoodsmarket.com", "whole foods market": "wholefoodsmarket.com", "home depot": "homedepot.com",
    "apple cash": "apple.com", "cash app": "cash.app", "h&m": "hm.com",
    "betr": "betr.app", "empower": "empower.com", "alight": "alight.com", "mohela": "mohela.com",
    "bank of america": "bankofamerica.com", "capital one": "capitalone.com", "us bank": "usbank.com",
}
WALLETS = ("venmo", "zelle", "paypal", "cash app", "apple cash")
# How banks shorten a brand, matched as the name or its start ("AMZN Mktp US*1A2B", "UBER *TRIP HELP.UBER.COM").
PREFIXES = {
    "amzn": "amazon.com", "amzn mktp": "amazon.com", "amazon mktp": "amazon.com", "wm supercenter": "walmart.com",
    "walmart supercenter": "walmart.com", "wal-mart": "walmart.com", "wholefds": "wholefoodsmarket.com",
    "costco whse": "costco.com", "uber trip": "uber.com", "uber eats": "uber.com", "apple com bill": "apple.com",
    "spotify": "spotify.com", "shell oil": "shell.com", "tesla supercharger": "tesla.com", "7-eleven": "7-eleven.com",
    "7 eleven": "7-eleven.com", "7eleven": "7-eleven.com",
}
TLDS = set("com net org co io app us me tv ai gov edu shop store ca uk de".split())
# Words that only say what kind of thing it was at a place: "Tesla Insurance" is Tesla's, "Chase CC payment" Chase's.
# The first word stands for the name only when everything after it is one of these ("First Platypus" is not first.com).
DESCRIBES = set("""
insurance membership plan subscription store shop order purchase rewards cc card payment payments refund interest
hysa checking savings loan bill bills account deposit fee fees app online pharmacy gas station market delivery
""".split())


def folder() -> Path:
    return Path(os.environ.get("TALLY_LOGOS", "data/logos"))


def key() -> str:
    return os.environ.get("LOGO_DEV_KEY", "").strip()


def norm(name: str) -> str:
    """What a name looks up by: lower case, without notes in brackets, store numbers or trailing punctuation.
    "Costco (groceries)" and "COSTCO #482" are both "costco"."""
    s = re.sub(r"\(.*?\)|\[.*?\]", " ", name or "").lower()
    s = re.sub(r"#\s*\d+|\b\d{3,}\b", " ", s)
    s = re.sub(r"[^\w&'.+ -]+", " ", s)
    return re.sub(r"\s+", " ", s).strip(" -.'")


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.replace("&", "and") if len(s) > 4 else s)


def _site(word: str) -> Optional[str]:
    """A word that is already a website ("amazon.com", "www.target.com"), as its domain."""
    w = word.removeprefix("www.")
    return w if re.fullmatch(r"[a-z0-9-]+(\.[a-z0-9-]+)+", w) and w.rsplit(".", 1)[1] in TLDS else None


def domains_for(name: str) -> list[str]:
    """Websites a name could be, best first; none for a word that only describes."""
    n = norm(name)
    if not n:
        return []
    if site := _site(n.split()[0]):  # "Amazon.com" was amazoncom.com
        return [site]
    words = n.split()
    if len(words) > 1 and words[0] == "the":  # "The Home Depot"
        words = words[1:]
    if len(words) > 1 and words[-1] in ("usa", "us"):  # "Spotify USA", "AMZN Mktp US"
        words = words[:-1]
    n = " ".join(words)
    for w in WALLETS:  # "Venmo to Lex", "Zelle from Jon": the logo is the wallet's
        if n == w or n.startswith(w + " "):
            return [DOMAINS.get(w, _slug(w) + ".com")]
    if n in DOMAINS:
        return [DOMAINS[n]]
    for k in sorted(PREFIXES, key=len, reverse=True):
        if n == k or n.startswith(k + " "):
            return [PREFIXES[k]]
    if all(w in GENERIC for w in words) or len(_slug(n)) < 3:
        return []
    out = [_slug(n) + ".com"]
    first = words[0]
    if len(words) > 1 and first not in GENERIC and len(_slug(first)) >= 2 and all(w in DESCRIBES for w in words[1:]):
        out.append(DOMAINS.get(first, _slug(first) + ".com"))
    return list(dict.fromkeys(out))


def domain_of(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    host = urllib.parse.urlparse(url if "//" in url else "//" + url).hostname or ""
    host = host.lower().removeprefix("www.")
    return host if "." in host else None


def _sniff(data: bytes) -> bool:
    return data.startswith(b"\x89PNG\r\n\x1a\n") or data.startswith(b"\xff\xd8\xff") or \
        (data[:4] == b"RIFF" and data[8:12] == b"WEBP")


class Transient(Exception):
    """The fetch failed in a way that says nothing about the logo: try again later, don't remember a miss."""


class NoKey(Exception):
    """A logo.dev lookup with no LOGO_DEV_KEY: skipped, and not remembered as a miss."""


_until = threading.local()  # the current lookup's deadline (time.monotonic), set by resolve


def _timeout() -> float:
    left = getattr(_until, "t", None)
    left = 6.0 if left is None else left - time.monotonic()
    if left <= 0.05:
        raise Transient("out of time")
    return min(6.0, left)


def _get(url: str) -> Optional[bytes]:
    """The image at `url`; None when the answer is that there is none (404, 410, not an image). Raises Transient
    for anything else: a timeout, a 429 or 5xx, a network error."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Tally"})
        with urllib.request.urlopen(req, timeout=_timeout()) as r:
            data = r.read(512 * 1024)
    except urllib.error.HTTPError as e:
        if e.code in (400, 404, 410):
            return None
        raise Transient(f"HTTP {e.code}") from None
    except Transient:
        raise
    except Exception as e:  # URLError, timeouts, resets
        raise Transient(str(e)) from None
    return data if _sniff(data) else None


def from_domain(domain: str) -> Optional[bytes]:
    k = key()
    if not k:
        raise NoKey()
    q = urllib.parse.urlencode({"token": k, "size": SIZE, "format": "png", "retina": "true", "fallback": "404"})
    return _get(f"https://img.logo.dev/{urllib.parse.quote(domain)}?{q}")


def _path(kind: str, ident: str, ext: str) -> Path:
    return folder() / f"{kind}-{hashlib.sha1(ident.encode()).hexdigest()[:20]}.{ext}"


def cached(kind: str, ident: str) -> tuple[Optional[Path], bool]:
    """(the file, False) when there is one; (None, True) when a miss is still fresh or the logo was hidden."""
    png = _path(kind, ident, "png")
    if png.exists():
        return png, False
    if _path(kind, ident, "hidden").exists():
        return None, True
    for ext, age in (("miss", MISS_DAYS * 86400), ("wait", WAIT_SECONDS)):
        f = _path(kind, ident, ext)
        if f.exists() and time.time() - f.stat().st_mtime < age:
            return None, True
    return None, False


def _write(path: Path, data: bytes) -> None:
    """Write through a temp file of this writer's own: two requests storing one logo shared `<hash>.tmp`, and the
    second rename found it gone."""
    tmp = path.with_name(f"{path.name}.{uuid.uuid4().hex[:8]}.tmp")
    try:
        tmp.write_bytes(data)
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)


def store(kind: str, ident: str, data: Optional[bytes], mark: str = "miss") -> Optional[Path]:
    """Keep the logo, or with no data remember the miss (`mark`: "miss" for a month, "wait" for ten minutes)."""
    folder().mkdir(parents=True, exist_ok=True)
    if not data:
        _path(kind, ident, mark).touch()
        return None
    png = _path(kind, ident, "png")
    _write(png, data)
    _path(kind, ident, "wait").unlink(missing_ok=True)
    return png


def hide(kind: str, ident: str) -> None:
    """Never show this one's logo again (it was the wrong company)."""
    folder().mkdir(parents=True, exist_ok=True)
    _path(kind, ident, "png").unlink(missing_ok=True)
    _path(kind, ident, "hidden").touch()


def unhide(kind: str, ident: str) -> None:
    for ext in ("hidden", "miss", "wait"):
        _path(kind, ident, ext).unlink(missing_ok=True)


_locks: "weakref.WeakValueDictionary[tuple[str, str], threading.Lock]" = weakref.WeakValueDictionary()
_locks_guard = threading.Lock()


def _lock(kind: str, ident: str) -> threading.Lock:
    with _locks_guard:
        lk = _locks.get((kind, ident))
        if lk is None:
            lk = _locks[(kind, ident)] = threading.Lock()
        return lk


Sources = list[tuple[str, str]]


def resolve(kind: str, ident: str, sources: Union[Sources, Callable[[], Sources]],
            budget: float = BUDGET) -> Optional[Path]:
    """The cached logo, or the first source that gives one: ("url", plaid logo url), ("domain", site) or
    ("base64", png data). `sources` may be a function, called only when the cache has no answer. Requests for the
    same logo wait for the one already looking it up and share its answer."""
    hit, skip = cached(kind, ident)
    if hit or skip:
        return hit
    lk = _lock(kind, ident)
    with lk:
        hit, skip = cached(kind, ident)  # another request may have just looked it up
        if hit or skip:
            return hit
        unsure = nokey = False
        _until.t = time.monotonic() + budget
        try:
            for how, value in (sources() if callable(sources) else sources):
                try:
                    data = (_get(value) if how == "url" else from_domain(value) if how == "domain"
                            else _b64(value) if how == "base64" else None)
                except NoKey:
                    nokey = True
                    continue
                except Transient:
                    unsure = True
                    if time.monotonic() >= _until.t:
                        break
                    continue
                if data:
                    return store(kind, ident, data)
        finally:
            _until.t = None
        if unsure:
            return store(kind, ident, None, "wait")
        return None if nokey else store(kind, ident, None)


def _b64(s: str) -> Optional[bytes]:
    try:
        data = base64.b64decode(s, validate=True)
        return data if _sniff(data) else None
    except Exception:
        return None


# ---------- a logo's brand color (logo_color.py), remembered beside the cached logo ----------

def color_of(kind: str, ident: str, path: Path) -> Optional[str]:
    """brand_color for a cached logo, remembered beside it."""
    side = _path(kind, ident, "color")
    if side.exists() and side.stat().st_mtime >= path.stat().st_mtime:
        return side.read_text().strip() or None
    c = brand_color(path.read_bytes())
    _write(side, (c or "").encode())
    return c
