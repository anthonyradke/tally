#!/usr/bin/env bash
# Nightly snapshot of the live Tally DB via SQLite's online-backup API (safe while tally.service runs).
# Writes ~/backups/tally/tally-YYYY-MM-DD.db and copies data/receipts/, keeping the newest 30 nightly snapshots.
# Named snapshots (tally-<suffix>.db from `backup-x1.sh <suffix>`) are never pruned. Receipts are copied without
# --delete, so an older snapshot's photos are still there if it's ever restored.
set -euo pipefail
DATA_DIR="${TALLY_DATA:-$(cd "$(dirname "$0")/.." && pwd)/data}"
SRC="$DATA_DIR/tally.db"
DST_DIR="${TALLY_BACKUP_DIR:-$HOME/backups/tally}"
mkdir -p "$DST_DIR"
DST="$DST_DIR/tally-${1:-$(date +%F)}.db"
# A named snapshot is a "before" copy taken by hand: reusing a name used to replace the earlier one silently.
if [ -n "${1:-}" ] && [ -e "$DST" ]; then
  echo "$(date -Is) refused: $DST already exists; pick another name" >&2
  exit 1
fi
# The copy is checked before it replaces anything: a damaged snapshot never becomes the newest one.
python3 - "$SRC" "$DST.tmp" <<'PY'
import sqlite3, sys
src = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
dst = sqlite3.connect(sys.argv[2])
src.backup(dst); src.close()
ok = dst.execute("PRAGMA quick_check").fetchone()[0]
dst.close()
if ok != "ok":
    sys.exit(f"snapshot failed its integrity check: {ok}")
PY
mv -f "$DST.tmp" "$DST"
if [ -d "$DATA_DIR/receipts" ]; then
  rsync -a "$DATA_DIR/receipts/" "$DST_DIR/receipts/"
fi
{ ls -1t "$DST_DIR"/tally-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].db 2>/dev/null || true; } | tail -n +31 | xargs -r rm -f
echo "$(date -Is) backup ok -> $DST"
