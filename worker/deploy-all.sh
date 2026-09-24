#!/usr/bin/env bash
# Deploys EVERY server listed in servers.txt (copy servers.example.txt to
# servers.txt and fill in real account IDs first).
#
# Usage:
#   ./deploy-all.sh
#
# Exporting SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first means you
# won't be prompted for them 4 times — only ENCRYPTION_KEY is generated
# fresh per server (on purpose):
#   export SUPABASE_URL="https://xxxxx.supabase.co"
#   export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
#   ./deploy-all.sh

set -euo pipefail

CONFIG="servers.txt"
if [ ! -f "$CONFIG" ]; then
  echo "Missing $CONFIG — copy servers.example.txt to servers.txt and fill in real account IDs first."
  exit 1
fi

while IFS='=' read -r NAME ACCOUNT_ID; do
  # Skip blank lines and comments.
  [ -z "$NAME" ] && continue
  case "$NAME" in \#*) continue ;; esac

  ./deploy-server.sh "$NAME" "$ACCOUNT_ID"
  echo ""
done < "$CONFIG"

echo "All servers deployed. Add each printed URL in /sa -> Media Servers,"
echo "then use the Check button next to each one to confirm it's up."
