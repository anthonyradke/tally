"""Asking Plaid to check the banks now (/transactions/refresh): how often, from a pull, from opening the app, on the
schedule, and refusals that must never break a sync. All data is made up; nothing reaches Plaid."""
from __future__ import annotations
import threading
import time
from datetime import date, datetime, timedelta, timezone
import pytest
from app import api_bank, bank, plaid
from tests.conftest import freeze
from tests.test_bank import FakePlaid, row


class RefreshPlaid(FakePlaid):
    """FakePlaid that also answers /transactions/refresh: records each ask, or refuses with `refuse[token]`."""
    def __init__(self):
        super().__init__()
        self.refreshed: list[str] = []
        self.refuse: dict[str, str] = {}
        self.gate: threading.Event | None = None  # when set up, a refresh waits for it
        self.started = threading.Event()

    def __call__(self, path, body, timeout=30):
        if path == "/transactions/refresh":
            self.started.set()
            if self.gate is not None:
                assert self.gate.wait(5)
            token = body["access_token"]
            if token in self.refuse:
                raise plaid.PlaidError(self.refuse[token], "refused", 400)
            self.refreshed.append(token)
            return {"request_id": "r"}
        return super().__call__(path, body, timeout)


@pytest.fixture
def fake(monkeypatch):
    f = RefreshPlaid()
    monkeypatch.setenv("PLAID_CLIENT_ID", "id")
    monkeypatch.setenv("PLAID_SECRET", "secret")
    monkeypatch.setenv("PLAID_ENV", "sandbox")
    monkeypatch.setattr(plaid, "call", f)
    return f


@pytest.fixture
def two(client, fake, monkeypatch):
    """Two connected banks: the test bank (id 1) and a second one (id 2)."""
    freeze(monkeypatch, date(2026, 9, 30))
    assert client.post("/api/bank/sandbox/connect").status_code == 201
    b = bank.connect()
    b.execute("INSERT INTO items(item_id, access_token, synced_at) VALUES('item-2','access-2',?)", (bank._now(),))
    b.commit()
    b.close()
    fake.refreshed.clear()
    return fake


def age(iid: int, seconds: int) -> None:
    """Pretend connection `iid` was last asked to refresh `seconds` ago."""
    b = bank.connect()
    b.execute("UPDATE items SET refreshed_at=? WHERE id=?",
              ((datetime.now(timezone.utc) - timedelta(seconds=seconds)).isoformat(timespec="seconds"), iid))
    b.commit()
    b.close()


def settle_background() -> None:
    for t in threading.enumerate():
        if t.name.startswith("tally-refresh"):
            t.join(5)


# ---------- a pull to refresh ----------

def test_a_pull_asks_every_bank_then_syncs(client, two):
    two.push(added=[row("t1", "acc-card", 4.5, "2026-09-29", "COFFEE", "Blue Cup")])
    r = client.post("/api/bank/sync")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["refreshing"] == 2 and sorted(two.refreshed) == ["access-2", "access-sandbox-1"]
    assert body["synced"]["1"]["added"] == 1  # the sync still ran as before


def test_a_bank_is_asked_at_most_every_ten_minutes_from_a_pull(client, two):
    client.post("/api/bank/sync")
    assert client.post("/api/bank/sync").json()["refreshing"] == 0
    assert len(two.refreshed) == 2
    age(1, bank.REFRESH_PULL + 5)  # bank 1's ten minutes are up; bank 2's aren't
    assert client.post("/api/bank/sync").json()["refreshing"] == 1
    assert two.refreshed[-1] == "access-sandbox-1"


# ---------- opening the app ----------

def test_opening_the_app_asks_hourly_without_waiting(client, two):
    two.gate = threading.Event()  # Plaid takes its time answering
    try:
        t0 = time.monotonic()
        r = client.post("/api/bank/sync?max_age=1800")
        assert r.status_code == 200 and r.json()["refreshing"] == 2
        assert time.monotonic() - t0 < 3  # answered while Plaid was still busy
        assert two.started.wait(2) and two.refreshed == []
    finally:
        two.gate.set()
    settle_background()
    assert sorted(two.refreshed) == ["access-2", "access-sandbox-1"]
    age(1, bank.REFRESH_PULL + 5)  # a pull would ask again by now; an open waits for the hour
    assert client.post("/api/bank/sync?max_age=1800").json()["refreshing"] == 0
    age(1, bank.REFRESH_OPEN + 5)
    assert client.post("/api/bank/sync?max_age=1800").json()["refreshing"] == 1
    settle_background()
    assert len(two.refreshed) == 3


def test_opening_the_app_still_syncs_when_stale(client, two):
    b = bank.connect()
    b.execute("UPDATE items SET synced_at='2020-01-01T00:00:00+00:00', tried_at=NULL")
    b.commit()
    b.close()
    two.push(added=[row("t1", "acc-card", 4.5, "2026-09-29", "COFFEE", "Blue Cup")])
    body = client.post("/api/bank/sync?max_age=1800").json()
    settle_background()
    assert body["refreshing"] == 2 and body["synced"]["1"]["added"] == 1


def test_opening_the_app_skips_a_bank_in_error(client, two):
    b = bank.connect()
    b.execute("UPDATE items SET error='ITEM_LOGIN_REQUIRED' WHERE id=2")
    b.execute("UPDATE items SET error='PENDING_EXPIRATION' WHERE id=1")  # a warning: it still works
    b.commit()
    b.close()
    assert client.post("/api/bank/sync?max_age=1800").json()["refreshing"] == 1
    settle_background()
    assert two.refreshed == ["access-sandbox-1"]


# ---------- refusals ----------

def test_a_refusal_never_breaks_the_sync(client, two):
    two.refuse["access-sandbox-1"] = "ITEM_LOGIN_REQUIRED"
    two.refuse["access-2"] = "RATE_LIMIT_EXCEEDED"
    two.push(added=[row("t1", "acc-card", 4.5, "2026-09-29", "COFFEE", "Blue Cup")])
    r = client.post("/api/bank/sync")
    assert r.status_code == 200 and r.json()["synced"]["1"]["added"] == 1


def test_a_surprise_from_plaid_never_breaks_the_sync(client, two, monkeypatch):
    def boom(token):
        raise RuntimeError("surprise")
    monkeypatch.setattr(plaid, "refresh", boom)
    r = client.post("/api/bank/sync")
    assert r.status_code == 200 and "synced" in r.json()


def test_a_plan_without_refresh_stops_asking_for_a_day(client, two):
    two.refuse["access-sandbox-1"] = "PRODUCT_NOT_ENABLED"
    two.refuse["access-2"] = "PRODUCT_NOT_ENABLED"
    assert client.post("/api/bank/sync").status_code == 200
    age(1, 99999)
    age(2, 99999)
    assert client.post("/api/bank/sync").json()["refreshing"] == 0
    assert client.post("/api/bank/sync?max_age=1800").json()["refreshing"] == 0
    assert api_bank.refresh_now() == {}
    b = bank.connect()
    bank.set_meta(b, "refresh_paused", (datetime.now(timezone.utc) - timedelta(seconds=bank.REFRESH_PAUSE + 5))
                  .isoformat(timespec="seconds"))
    b.close()
    two.refuse.clear()
    assert client.post("/api/bank/sync").json()["refreshing"] == 2  # a day later it tries again


# ---------- the schedule ----------

def test_the_schedule_runs_every_two_hours_from_seven_to_eleven():
    d = datetime(2026, 11, 26)
    assert api_bank.next_refresh(d.replace(hour=3)) == d.replace(hour=7)
    assert api_bank.next_refresh(d.replace(hour=7)) == d.replace(hour=9)
    assert api_bank.next_refresh(d.replace(hour=8, minute=59)) == d.replace(hour=9)
    assert api_bank.next_refresh(d.replace(hour=21, minute=30)) == d.replace(hour=23)
    assert api_bank.next_refresh(d.replace(hour=23)) == datetime(2026, 11, 27, 7)
    assert api_bank.next_refresh(d.replace(hour=23, minute=40)) == datetime(2026, 11, 27, 7)
    slots, t = [], d
    while (t := api_bank.next_refresh(t)).date() == d.date():
        slots.append(t.hour)
    assert slots == [7, 9, 11, 13, 15, 17, 19, 21, 23]


def test_the_schedule_asks_working_banks_only(client, two):
    b = bank.connect()
    b.execute("UPDATE items SET error='ITEM_LOGIN_REQUIRED' WHERE id=2")
    b.commit()
    b.close()
    assert api_bank.refresh_now() == {1: "ok"}
    assert api_bank.refresh_now() == {}  # asked just now
    assert two.refreshed == ["access-sandbox-1"]
