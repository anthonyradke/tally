"""Logos for entries and accounts, fetched once and kept in TALLY_LOGOS (default data/logos).

Where a logo comes from, surest first:
  1. The bank: Plaid's own merchant logo or website on a bank row with the same merchant, or on the row paired with
     an entry of that name; for an account, the connected institution's website or Plaid's logo for it.
  2. The name as a website: "Chipotle" is chipotle.com, "King Soopers" kingsoopers.com, looked up on logo.dev
     (LOGO_DEV_KEY, a publishable key) with fallback=404, so a name that isn't a site has no logo.
Never logo.dev's best-match name search: it always answers, and a local shop got a stranger's logo.

Words that only describe ("Paycheck", "Rent", "Gas") are never looked up, and a logo shown wrong can be hidden for good
(`hide`). A miss is remembered for a month, then tried again (the bank may have learned the merchant since).
"""
from __future__ import annotations
import base64
import hashlib
import os
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

MISS_DAYS = 30
SIZE = 128
GENERIC = set("""
rent paycheck payroll salary income interest dividend transfer payment payments refund refunds deposit withdrawal cash
atm fee fees tax taxes tip tips gift gifts groceries grocery gas fuel charging dinner lunch breakfast coffee drinks
parking toll tolls utilities utility bill bills insurance mortgage loan loans savings saving checking credit debit
card home phone internet water sewer trash electric power haircut doctor dentist vet pharmacy medicine misc other
mom dad lex reimbursement repayment paid back owed lent borrowed allowance bonus contract freelance liquor store
""".split())
# The name a ledger or a bank uses, where the brand's site isn't simply the name with ".com".
DOMAINS = {
    "amex": "americanexpress.com", "american express": "americanexpress.com", "wells": "wellsfargo.com",
    "wells fargo": "wellsfargo.com", "schwab": "schwab.com", "charles schwab": "schwab.com", "x": "x.com",
    "x money": "x.com", "steam": "steampowered.com", "xcel": "xcelenergy.com", "vasa": "vasafitness.com",
    "uber eats": "ubereats.com", "apple": "apple.com", "icloud": "apple.com", "app store": "apple.com",
    "betr": "betr.app", "empower": "empower.com", "alight": "alight.com", "mohela": "mohela.com",
    "bank of america": "bankofamerica.com", "capital one": "capitalone.com", "us bank": "usbank.com",
}
WALLETS = ("venmo", "zelle", "paypal", "cash app", "apple cash")
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


def domains_for(name: str) -> list[str]:
    """Websites a name could be, best first; none for a word that only describes."""
    n = norm(name)
    if not n:
        return []
    for w in WALLETS:  # "Venmo to Lex", "Zelle from Jon": the logo is the wallet's
        if n == w or n.startswith(w + " "):
            return [DOMAINS.get(w, _slug(w) + ".com")]
    if n in DOMAINS:
        return [DOMAINS[n]]
    words = n.split()
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


def _get(url: str) -> Optional[bytes]:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Tally"})
        with urllib.request.urlopen(req, timeout=6) as r:
            data = r.read(512 * 1024)
        return data if _sniff(data) else None
    except Exception:
        return None


def from_domain(domain: str) -> Optional[bytes]:
    k = key()
    if not k:
        return None
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
    miss = _path(kind, ident, "miss")
    if miss.exists() and time.time() - miss.stat().st_mtime < MISS_DAYS * 86400:
        return None, True
    return None, False


def store(kind: str, ident: str, data: Optional[bytes]) -> Optional[Path]:
    folder().mkdir(parents=True, exist_ok=True)
    if not data:
        _path(kind, ident, "miss").touch()
        return None
    png = _path(kind, ident, "png")
    tmp = png.with_suffix(".tmp")
    tmp.write_bytes(data)
    tmp.replace(png)
    return png


def hide(kind: str, ident: str) -> None:
    """Never show this one's logo again (it was the wrong company)."""
    folder().mkdir(parents=True, exist_ok=True)
    _path(kind, ident, "png").unlink(missing_ok=True)
    _path(kind, ident, "hidden").touch()


def unhide(kind: str, ident: str) -> None:
    for ext in ("hidden", "miss"):
        _path(kind, ident, ext).unlink(missing_ok=True)


def resolve(kind: str, ident: str, sources: list[tuple[str, str]]) -> Optional[Path]:
    """The cached logo, or the first source that gives one: ("url", plaid logo url), ("domain", site) or
    ("base64", png data)."""
    hit, skip = cached(kind, ident)
    if hit or skip:
        return hit
    for how, value in sources:
        data = (_get(value) if how == "url" else from_domain(value) if how == "domain"
                else _b64(value) if how == "base64" else None)
        if data:
            return store(kind, ident, data)
    return store(kind, ident, None)


def _b64(s: str) -> Optional[bytes]:
    try:
        data = base64.b64decode(s, validate=True)
        return data if _sniff(data) else None
    except Exception:
        return None


# ---------- a logo's brand color, for tinting an entry's page or an account's card ----------

def _png_pixels(data: bytes) -> Optional[tuple[int, int, list[tuple[int, int, int, int]]]]:
    """Width, height and RGBA pixels of an 8-bit, non-interlaced PNG (what logo.dev and Plaid serve); None for
    anything else. Standard library only."""
    import struct
    import zlib
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        return None
    pos, idat, plte, trns = 8, [], b"", b""
    w = h = depth = ctype = inter = 0
    while pos + 8 <= len(data):
        n, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        if kind == b"IHDR":
            w, h, depth, ctype, _, _, inter = struct.unpack(">IIBBBBB", body)
        elif kind == b"PLTE":
            plte = body
        elif kind == b"tRNS":
            trns = body
        elif kind == b"IDAT":
            idat.append(body)
        elif kind == b"IEND":
            break
        pos += 12 + n
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(ctype)
    if depth != 8 or inter or not channels or not w or not h or w * h > 4_000_000:
        return None
    try:
        raw = zlib.decompress(b"".join(idat))
    except zlib.error:
        return None
    stride = w * channels
    if len(raw) < h * (stride + 1):
        return None
    out: list[tuple[int, int, int, int]] = []
    prev = bytearray(stride)
    for y in range(h):
        f = raw[y * (stride + 1)]
        line = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            a = line[i - channels] if i >= channels else 0
            b, c = prev[i], prev[i - channels] if i >= channels else 0
            if f == 1:
                line[i] = (line[i] + a) & 255
            elif f == 2:
                line[i] = (line[i] + b) & 255
            elif f == 3:
                line[i] = (line[i] + (a + b) // 2) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        prev = line
        if y % 2:
            continue  # every other row and column is plenty for a color
        for x in range(0, w, 2):
            px = line[x * channels:(x + 1) * channels]
            if ctype == 6:
                out.append((px[0], px[1], px[2], px[3]))
            elif ctype == 2:
                out.append((px[0], px[1], px[2], 255))
            elif ctype == 3:
                i = px[0]
                if 3 * i + 2 >= len(plte):
                    continue
                out.append((plte[3 * i], plte[3 * i + 1], plte[3 * i + 2], trns[i] if i < len(trns) else 255))
            elif ctype == 4:
                out.append((px[0], px[0], px[0], px[1]))
            else:
                out.append((px[0], px[0], px[0], 255))
    return w, h, out


def brand_color(data: bytes) -> Optional[str]:
    """The color a logo is mostly drawn in, as #RRGGBB: the strongest hue among its opaque pixels, skipping white
    and grays. A logo in black alone is black; one with no ink to speak of has none."""
    import colorsys
    got = _png_pixels(data)
    if not got:
        return None
    bins: dict[int, list[float]] = {}
    opaque = dark = 0
    dark_sum = [0, 0, 0]
    for r, g, b, a in got[2]:
        if a < 160:
            continue
        opaque += 1
        hue, light, sat = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        if sat > 0.28 and 0.12 < light < 0.9:
            k = int(hue * 18) % 18
            s = bins.setdefault(k, [0.0, 0.0, 0.0, 0.0])
            wgt = sat * (1 - abs(light - 0.5))
            s[0] += wgt
            s[1] += r * wgt
            s[2] += g * wgt
            s[3] += b * wgt
        elif light < 0.2:
            dark += 1
            dark_sum[0] += r
            dark_sum[1] += g
            dark_sum[2] += b
    if not opaque:
        return None
    if bins:
        k, s = max(bins.items(), key=lambda kv: kv[1][0])
        if s[0] > opaque * 0.03:
            return "#%02X%02X%02X" % (round(s[1] / s[0]), round(s[2] / s[0]), round(s[3] / s[0]))
    if dark > opaque * 0.15:
        return "#%02X%02X%02X" % tuple(round(v / dark) for v in dark_sum)
    return None


def color_of(kind: str, ident: str, path: Path) -> Optional[str]:
    """brand_color for a cached logo, remembered beside it."""
    side = _path(kind, ident, "color")
    if side.exists() and side.stat().st_mtime >= path.stat().st_mtime:
        return side.read_text().strip() or None
    c = brand_color(path.read_bytes())
    side.write_text(c or "")
    return c
