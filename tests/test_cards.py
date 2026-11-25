"""Brand colors read from logos, and the pictures of real cards on Accounts. Made-up images only."""
from __future__ import annotations
import struct
import zlib
from app import logos


def png(w: int, h: int, pixel, ctype: int = 6) -> bytes:
    """A tiny PNG: `pixel(x, y)` gives RGBA. Every row uses a different filter, so decoding is tested too."""
    ch = 4 if ctype == 6 else 3
    rows = b""
    for y in range(h):
        f = y % 5
        line = bytes(v for x in range(w) for v in pixel(x, y)[:ch])
        prev = bytes(v for x in range(w) for v in pixel(x, y - 1)[:ch]) if y else bytes(len(line))
        enc = bytearray()
        for i, v in enumerate(line):
            a = line[i - ch] if i >= ch else 0
            b, c = prev[i], prev[i - ch] if i >= ch else 0
            pred = [0, a, b, (a + b) // 2, (a if abs(b - c) <= abs(a - c) and abs(b - c) <= abs(a + b - 2 * c)
                                           else b if abs(a - c) <= abs(a + b - 2 * c) else c)][f]
            enc.append((v - pred) & 255)
        rows += bytes([f]) + bytes(enc)

    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, ctype, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b""))


def test_brand_color_is_the_logo_ink():
    red_on_white = png(20, 20, lambda x, y: (230, 20, 40, 255) if 5 <= x < 15 else (255, 255, 255, 255))
    assert logos.brand_color(red_on_white) == "#E61428"
    rgb = png(20, 20, lambda x, y: (10, 80, 200, 255) if y > 8 else (250, 250, 250, 255), ctype=2)
    assert logos.brand_color(rgb) == "#0A50C8"
    black = png(16, 16, lambda x, y: (0, 0, 0, 255) if x % 2 == 0 else (0, 0, 0, 0))
    assert logos.brand_color(black) == "#000000"
    assert logos.brand_color(png(8, 8, lambda x, y: (255, 255, 255, 255))) is None
    assert logos.brand_color(b"\xff\xd8\xff not a png") is None


def test_color_route(client, monkeypatch):
    monkeypatch.setenv("LOGO_DEV_KEY", "pk_test")
    img = png(12, 12, lambda x, y: (0, 160, 90, 255))
    monkeypatch.setattr(logos, "_get", lambda url: img if "costco.com" in url else None)
    assert client.get("/api/logo/color", params={"name": "Costco"}).json() == {"color": "#00A05A"}
    assert client.get("/api/logo/color", params={"name": "Zzq Nowhere"}).json() == {"color": None}


def test_card_art(client, world):
    aid = client.get("/api/bootstrap").json()["accounts"][0]["id"]
    jpg = b"\xff\xd8\xff\xe0" + b"0" * 100
    r = client.put(f"/api/accounts/{aid}/art", files={"file": ("card.jpg", jpg, "image/jpeg")})
    assert r.status_code == 200, r.text
    name = r.json()["art"]
    assert client.get("/api/cards").json()[str(aid)]["art"] == name
    assert client.get(f"/api/receipts/{name}").content == jpg
    bad = client.put(f"/api/accounts/{aid}/art", files={"file": ("card.jpg", b"GIF89a", "image/jpeg")})
    assert bad.status_code == 422
    assert client.delete(f"/api/accounts/{aid}/art").status_code == 204
    assert client.get("/api/cards").json()[str(aid)]["art"] is None
    assert client.get(f"/api/receipts/{name}").status_code == 404
