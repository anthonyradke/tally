#!/bin/sh
# Pull x1's nightly snapshots into the iCloud Financial folder (run by launchd daily, or by hand).
DEST="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Financial/money-backups"
mkdir -p "$DEST"
exec rsync -a --timeout=30 x1:backups/tally/ "$DEST/"
