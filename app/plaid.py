"""A small client for Plaid's REST API (https://plaid.com/docs/api/), standard library only. Bank sync is off unless
PLAID_CLIENT_ID and PLAID_SECRET are set; PLAID_ENV picks sandbox (the default) or production. PLAID_WEBHOOK_URL,
when set, is where Plaid reports new transactions (api_bank.webhook), so they arrive minutes after Plaid has them.

Plaid signs amounts from the account's point of view: positive is money leaving it (a purchase, a payment out, a
charge on a card), negative is money arriving (a deposit, a refund, a payment to a card)."""
from __future__ import annotations
import base64
import hashlib
import hmac
import http.client
import json
import os
import threading
import time
import urllib.error
import urllib.request

HOSTS = {"sandbox": "https://sandbox.plaid.com", "production": "https://production.plaid.com"}
HISTORY_DAYS = 730  # the most Plaid will fetch; it can only be asked for when a bank is first connected


class PlaidError(Exception):
    def __init__(self, code: str, message: str, status: int = 0):
        super().__init__(f"{code}: {message}")
        self.code, self.message, self.status = code, message, status


def enabled() -> bool:
    return bool(os.environ.get("PLAID_CLIENT_ID", "").strip() and os.environ.get("PLAID_SECRET", "").strip())


def env() -> str:
    e = os.environ.get("PLAID_ENV", "sandbox").strip() or "sandbox"
    if e not in HOSTS:
        raise PlaidError("BAD_ENV", f"PLAID_ENV must be one of {', '.join(HOSTS)}")
    return e


def call(path: str, body: dict, timeout: float = 30) -> dict:
    """POST one request. Raises PlaidError with Plaid's own error_code (ITEM_LOGIN_REQUIRED, ...) on failure."""
    payload = {"client_id": os.environ["PLAID_CLIENT_ID"].strip(), "secret": os.environ["PLAID_SECRET"].strip(), **body}
    req = urllib.request.Request(HOSTS[env()] + path, data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Plaid-Version": "2020-09-14"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            err = json.load(e)
        except ValueError:
            raise PlaidError("HTTP_ERROR", f"Plaid answered {e.code}", e.code)
        raise PlaidError(err.get("error_code") or "UNKNOWN", err.get("display_message") or err.get("error_message")
                         or "Plaid refused the request", e.code)
    except urllib.error.URLError as e:
        raise PlaidError("NETWORK", f"Couldn't reach Plaid ({e.reason})")
    except (OSError, http.client.HTTPException, ValueError) as e:
        # A timeout or reset while reading the answer, a broken response, or one that isn't JSON: the same to the
        # caller as not reaching Plaid at all.
        raise PlaidError("NETWORK", f"Couldn't reach Plaid ({e.__class__.__name__})")


def webhook_url() -> str | None:
    return os.environ.get("PLAID_WEBHOOK_URL", "").strip() or None


def link_token(access_token: str | None = None, user_id: str | None = None) -> str:
    """A token for Plaid Link on the phone. With an access token it opens update mode, which repairs a broken
    connection in place: a new connection would use up another of the Trial plan's ten lifetime Items. With a Plaid
    user (`create_user`) one session can add several banks (Multi-Item Link); `session_tokens` collects them."""
    body: dict = {"client_name": os.environ.get("PLAID_CLIENT_NAME", "Tally"), "language": "en",
                  "country_codes": ["US"]}
    if access_token:
        body["access_token"] = access_token
        body["user"] = {"client_user_id": "owner"}
    else:
        body["products"] = ["transactions"]
        body["transactions"] = {"days_requested": HISTORY_DAYS}
        if user_id:
            body["user_id"] = user_id
            body["enable_multi_item_link"] = True
        else:
            body["user"] = {"client_user_id": "owner"}
    if hook := webhook_url():
        body["webhook"] = hook
    if uri := os.environ.get("PLAID_REDIRECT_URI", "").strip():
        body["redirect_uri"] = uri
    return call("/link/token/create", body)["link_token"]


def create_user(client_user_id: str) -> str:
    """A Plaid user, which Multi-Item Link needs. Made once and kept (bank.meta)."""
    return call("/user/create", {"client_user_id": client_user_id})["user_id"]


def session_tokens(link_token: str) -> list[str]:
    """The public token of every bank added in a Multi-Item Link session (Plaid keeps them six hours)."""
    r = call("/link/token/get", {"link_token": link_token})
    return [x["public_token"] for s in r.get("link_sessions") or []
            for x in ((s.get("results") or {}).get("item_add_results") or []) if x.get("public_token")]


def set_webhook(access_token: str, url: str | None) -> None:
    call("/item/webhook/update", {"access_token": access_token, "webhook": url})


# ---------- webhook verification (https://plaid.com/docs/api/webhooks/webhook-verification/) ----------
_keys: dict[str, object] = {}
_keys_lock = threading.Lock()
MAX_AGE = 5 * 60


def _b64url(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _key(kid: str):
    from cryptography.hazmat.primitives.asymmetric import ec
    with _keys_lock:
        if kid in _keys:
            return _keys[kid]
    jwk = call("/webhook_verification_key/get", {"key_id": kid})["key"]
    if jwk.get("kty") != "EC" or jwk.get("crv") != "P-256":
        raise PlaidError("BAD_KEY", "Unexpected webhook key type")
    pub = ec.EllipticCurvePublicNumbers(int.from_bytes(_b64url(jwk["x"]), "big"), int.from_bytes(_b64url(jwk["y"]), "big"),
                                        ec.SECP256R1()).public_key()
    if jwk.get("expired_at"):
        return pub  # an expired key still checks old messages, but isn't cached
    with _keys_lock:
        _keys[kid] = pub
    return pub


def verify_webhook(body: bytes, token: str | None, now: float | None = None) -> bool:
    """True when the Plaid-Verification JWT is Plaid's (ES256, by a key Plaid lists), under five minutes old, and
    signs exactly this body."""
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
    try:
        head_b, claims_b, sig_b = (token or "").split(".")
        head = json.loads(_b64url(head_b))
        if head.get("alg") != "ES256" or not head.get("kid"):
            return False
        sig = _b64url(sig_b)
        if len(sig) != 64:
            return False
        der = encode_dss_signature(int.from_bytes(sig[:32], "big"), int.from_bytes(sig[32:], "big"))
        _key(head["kid"]).verify(der, f"{head_b}.{claims_b}".encode(), ec.ECDSA(hashes.SHA256()))
        claims = json.loads(_b64url(claims_b))
        if abs((now or time.time()) - float(claims.get("iat", 0))) > MAX_AGE:
            return False
        return hmac.compare_digest(hashlib.sha256(body).hexdigest(), str(claims.get("request_body_sha256", "")))
    except (ValueError, KeyError, TypeError, InvalidSignature, PlaidError):
        return False


def exchange(public_token: str) -> tuple[str, str]:
    r = call("/item/public_token/exchange", {"public_token": public_token})
    return r["access_token"], r["item_id"]


def item(access_token: str) -> dict:
    return call("/item/get", {"access_token": access_token})


def institution(institution_id: str) -> dict:
    """Name, website (`url`), logo (base64 PNG) and brand color (`primary_color`), where Plaid has them."""
    return call("/institutions/get_by_id", {"institution_id": institution_id, "country_codes": ["US"],
                                            "options": {"include_optional_metadata": True}})["institution"]


def accounts(access_token: str) -> list[dict]:
    """Accounts with the balances Plaid last saw (may be a few hours old; /accounts/balance/get forces a fresh one
    and is billed per call)."""
    return call("/accounts/get", {"access_token": access_token})["accounts"]


def sync(access_token: str, cursor: str | None) -> dict:
    """One page of /transactions/sync: added, modified, removed, next_cursor, has_more."""
    body: dict = {"access_token": access_token, "count": 500, "options": {"include_original_description": True}}
    if cursor:
        body["cursor"] = cursor
    return call("/transactions/sync", body)


def refresh(access_token: str) -> None:
    """Ask Plaid to check the bank for new transactions now instead of on its own schedule (1-4 times a day). It
    answers at once; what the bank has arrives later through the webhook (SYNC_UPDATES_AVAILABLE)."""
    call("/transactions/refresh", {"access_token": access_token}, timeout=15)


def remove(access_token: str) -> None:
    call("/item/remove", {"access_token": access_token})


def sandbox_item(institution_id: str = "ins_109508") -> str:
    """Sandbox only: a public token for a test bank without going through Link (ins_109508 is First Platypus)."""
    return call("/sandbox/public_token/create", {
        "institution_id": institution_id, "initial_products": ["transactions"],
        "options": {"transactions": {"days_requested": HISTORY_DAYS}}})["public_token"]
