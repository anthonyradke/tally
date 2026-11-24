"""A small client for Plaid's REST API (https://plaid.com/docs/api/), standard library only. Bank sync is off unless
PLAID_CLIENT_ID and PLAID_SECRET are set; PLAID_ENV picks sandbox (the default) or production.

Plaid signs amounts from the account's point of view: positive is money leaving it (a purchase, a payment out, a
charge on a card), negative is money arriving (a deposit, a refund, a payment to a card)."""
from __future__ import annotations
import json
import os
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


def link_token(access_token: str | None = None) -> str:
    """A token for Plaid Link on the phone. With an access token it opens update mode, which repairs a broken
    connection in place: a new connection would use up another of the Trial plan's ten lifetime Items."""
    body: dict = {"client_name": os.environ.get("PLAID_CLIENT_NAME", "Tally"), "language": "en",
                  "country_codes": ["US"], "user": {"client_user_id": "owner"}}
    if access_token:
        body["access_token"] = access_token
    else:
        body["products"] = ["transactions"]
        body["transactions"] = {"days_requested": HISTORY_DAYS}
    if uri := os.environ.get("PLAID_REDIRECT_URI", "").strip():
        body["redirect_uri"] = uri
    return call("/link/token/create", body)["link_token"]


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


def remove(access_token: str) -> None:
    call("/item/remove", {"access_token": access_token})


def sandbox_item(institution_id: str = "ins_109508") -> str:
    """Sandbox only: a public token for a test bank without going through Link (ins_109508 is First Platypus)."""
    return call("/sandbox/public_token/create", {
        "institution_id": institution_id, "initial_products": ["transactions"],
        "options": {"transactions": {"days_requested": HISTORY_DAYS}}})["public_token"]
