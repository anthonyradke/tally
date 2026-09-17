#!/bin/sh
# Nightly SQLite snapshot + CSV exports. Cron on the server, or run by hand.
#   0 3 * * * /path/to/money/scripts/backup.sh
# DEST defaults to the iCloud Financial folder on a Mac; on the server point it at a
# Nextcloud-synced folder, e.g. DEST=/srv/nextcloud/data/you/files/Financial/money-backups
set -e
DB="${MONEY_DB:-$(dirname "$0")/../data/money.db}"
DEST="${DEST:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/Financial/money-backups}"
mkdir -p "$DEST"
stamp=$(date +%Y-%m-%d)
sqlite3 "$DB" ".backup '$DEST/money-$stamp.db'"
sqlite3 -header -csv "$DB" "SELECT t.date, t.what, c.name AS category, f.name AS from_account, o.name AS to_account, t.amount/100.0 AS amount
  FROM transactions t JOIN categories c ON c.id=t.category_id
  LEFT JOIN accounts f ON f.id=t.from_account_id LEFT JOIN accounts o ON o.id=t.to_account_id ORDER BY t.date, t.id" > "$DEST/log-$stamp.csv"
ls -t "$DEST"/money-*.db | tail -n +31 | xargs rm -f 2>/dev/null || true   # keep 30 days
echo "backed up to $DEST/money-$stamp.db"
