#!/usr/bin/env bash
# Nightly snapshot of the live Tally DB via SQLite's online-backup API (safe while tally.service runs).
# Writes ~/backups/tally/tally-YYYY-MM-DD.db and copies data/receipts/, keeping the newest 30 nightly snapshots.
# Named snapshots (tally-<suffix>.db from `backup-x1.sh <suffix>`) are never pruned. Receipts are copied without
# --delete, so an older snapshot's photos are still there if it's ever restored.
set -euo pipefail
SRC=/home/tony/projects/tally/data/tally.db
DST_DIR=/home/tony/backups/tally
mkdir -p "$DST_DIR"
DST="$DST_DIR/tally-${1:-$(date +%F)}.db"
python3 - "$SRC" "$DST.tmp" <<'PY'
import sqlite3, sys
src = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
dst = sqlite3.connect(sys.argv[2])
src.backup(dst); dst.close(); src.close()
PY
mv -f "$DST.tmp" "$DST"
if [ -d /home/tony/projects/tally/data/receipts ]; then
  rsync -a /home/tony/projects/tally/data/receipts/ "$DST_DIR/receipts/"
fi
ls -1t "$DST_DIR"/tally-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].db | tail -n +31 | xargs -r rm -f
echo "$(date -Is) backup ok -> $DST"
