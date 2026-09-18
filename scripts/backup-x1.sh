#!/usr/bin/env bash
# Nightly snapshot of the live Money DB via SQLite's online-backup API (safe while money.service runs).
# Writes ~/backups/money/money-YYYY-MM-DD.db, mirrors data/receipts/, keeps the newest 30 snapshots.
set -euo pipefail
SRC=/home/tony/projects/money/data/money.db
DST_DIR=/home/tony/backups/money
mkdir -p "$DST_DIR"
DST="$DST_DIR/money-${1:-$(date +%F)}.db"
python3 - "$SRC" "$DST.tmp" <<'PY'
import sqlite3, sys
src = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
dst = sqlite3.connect(sys.argv[2])
src.backup(dst); dst.close(); src.close()
PY
mv -f "$DST.tmp" "$DST"
if [ -d /home/tony/projects/money/data/receipts ]; then
  rsync -a --delete /home/tony/projects/money/data/receipts/ "$DST_DIR/receipts/"
fi
ls -1t "$DST_DIR"/money-*.db | tail -n +31 | xargs -r rm -f
echo "$(date -Is) backup ok -> $DST"
