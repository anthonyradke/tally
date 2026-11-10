"""Login for the API, the same two layers as Hearth. (1) A bearer token (`TALLY_TOKEN`, from the unit's environment
file). (2) When `TALLY_OWNER` is set, the `Tailscale-User-Login` header that Tailscale Serve adds must match it, so
the token alone isn't enough from someone else's device; Serve strips any copy a client sends. With no token
configured (tests, a local copy) the API stays open."""
from __future__ import annotations
import hmac
import os
from fastapi import Request
from fastapi.responses import JSONResponse


def refuse(request: Request) -> JSONResponse | None:
    token = os.environ.get("TALLY_TOKEN", "").strip()
    if not token:
        return None
    got = request.headers.get("authorization", "")
    if not got.startswith("Bearer ") or not hmac.compare_digest(got[7:].strip().encode(), token.encode()):
        return JSONResponse({"detail": "bad or missing token"}, status_code=401)
    owner = os.environ.get("TALLY_OWNER", "").strip()
    if owner and request.headers.get("tailscale-user-login", "") != owner:
        return JSONResponse({"detail": "not the owner's tailnet login"}, status_code=403)
    return None
