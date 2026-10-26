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
python3 - "$SRC" "$DST.tmp" <<'PY'
import sqlite3, sys
src = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
dst = sqlite3.connect(sys.argv[2])
src.backup(dst); dst.close(); src.close()
PY
mv -f "$DST.tmp" "$DST"
if [ -d "$DATA_DIR/receipts" ]; then
  rsync -a "$DATA_DIR/receipts/" "$DST_DIR/receipts/"
fi
{ ls -1t "$DST_DIR"/tally-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].db 2>/dev/null || true; } | tail -n +31 | xargs -r rm -f
echo "$(date -Is) backup ok -> $DST"
