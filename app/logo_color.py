"""A logo's brand color, for tinting an entry's page or an account's card: PNG decoding with the standard library
only, the color a logo is mostly drawn in, and whether that color is fit for a wash."""
from __future__ import annotations
import re
from typing import Optional


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


def washes(color: Optional[str]) -> bool:
    """Whether a brand color makes a wash behind an entry's page: not black, white or gray, which only came out as
    a gray smudge (a logo drawn in black gives #000000)."""
    import colorsys
    if not color or not re.fullmatch(r"#[0-9A-Fa-f]{6}", color):
        return False
    r, g, b = (int(color[i:i + 2], 16) / 255 for i in (1, 3, 5))
    _, light, sat = colorsys.rgb_to_hls(r, g, b)
    return 0.12 < light < 0.92 and sat > 0.2
