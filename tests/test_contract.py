"""The app's TypeScript shapes against the real API: seed a demo database (made-up data), serve it on a free port
and run ios/test/contract.ts, which validates every answer against src/lib/api.ts and checks the app's own math
against the server's. Skipped when the app's node_modules aren't installed."""
from __future__ import annotations
import json
import random
import shutil
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path
import pytest
import uvicorn
from app.engine import SHAPES, Account, Txn, dollars, validate

ROOT = Path(__file__).resolve().parent.parent
IOS = ROOT / "ios"
pytestmark = pytest.mark.skipif(not (IOS / "node_modules" / "typescript").is_dir() or not shutil.which("node"),
                                reason="needs node and ios/node_modules (cd ios && npm ci)")


def facts() -> dict:
    rng = random.Random(3)
    values = [0, 1, -1, 5, 99, 100, 999, 1000, 99999, 100000, 123456789, -123456] + \
        [rng.randint(-10**11, 10**11) for _ in range(300)]
    accounts = {1: Account(1, "A", "cash"), 2: Account(2, "B", "cash")}
    combos = []
    for ty in SHAPES:
        for f in (None, 1, 2):
            for t in (None, 1, 2):
                errs = validate(Txn(None, None, "", 1, f, t, 100), ty, accounts)
                combos.append([ty, f, t, not errs])
    return {"dollars": {str(v): dollars(v) for v in values}, "validate": combos}


def test_app_shapes_match_the_api(tmp_path, monkeypatch):
    demo = tmp_path / "demo.db"
    seeded = subprocess.run([sys.executable, "scripts/seed_demo.py", str(demo)], cwd=ROOT, capture_output=True, text=True)
    assert seeded.returncode == 0, seeded.stderr
    monkeypatch.setenv("TALLY_DB", str(demo))
    monkeypatch.setenv("TALLY_BACKUPS", str(tmp_path / "none"))
    from app import api_files
    from app.main import app
    monkeypatch.setattr(api_files, "RECEIPTS", tmp_path / "demo-receipts")
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    srv = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    th = threading.Thread(target=srv.run, daemon=True)
    th.start()
    for _ in range(100):
        if srv.started:
            break
        time.sleep(0.05)
    try:
        (tmp_path / "facts.json").write_text(json.dumps(facts()))
        out = subprocess.run(["node", "--no-warnings", "--import", "./test/register.mjs", "test/contract.ts",
                              f"http://127.0.0.1:{port}", str(tmp_path / "facts.json")],
                             cwd=IOS, capture_output=True, text=True, timeout=180)
    finally:
        srv.should_exit = True
        th.join(5)
    print(out.stdout)
    assert out.returncode == 0, out.stdout + out.stderr
