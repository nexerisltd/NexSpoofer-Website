#!/usr/bin/env bash
# Deploys worker/ under ONE Cloudflare account and sets its 3 secrets.
#
# Usage:
#   ./deploy-server.sh <worker-name> <account-id>
#
# Run this from inside the worker/ folder (same place you'd normally run
# `npx wrangler deploy`). Requires you to already be logged in
# (`npx wrangler login`) and to already be an accepted Member on the target
# account — see DEPLOY-MULTIPLE.md.
#
# SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are the same for every server
# (same Supabase project). If you export them in your own shell first
# (e.g. `export SUPABASE_URL=...`), this script reuses them silently
# instead of prompting each time — handy when looping over several
# servers with deploy-all.sh. ENCRYPTION_KEY is intentionally generated
# fresh per server unless you explicitly export one yourself.

set -euo pipefail

NAME="${1:?Usage: deploy-server.sh <worker-name> <account-id>}"
ACCOUNT_ID="${2:?Usage: deploy-server.sh <worker-name> <account-id>}"

echo "=============================================="
echo " Deploying '$NAME' -> account $ACCOUNT_ID"
echo "=============================================="

npx wrangler deploy --name "$NAME" --account-id "$ACCOUNT_ID"

put_secret_from_env_or_prompt() {
  local key="$1"
  local value="${!key:-}"
  if [ -n "$value" ]; then
    echo "-> $key: using value from environment"
    printf '%s' "$value" | npx wrangler secret put "$key" --name "$NAME" --account-id "$ACCOUNT_ID"
  else
    echo "-> $key: not set in environment, will prompt"
    npx wrangler secret put "$key" --name "$NAME" --account-id "$ACCOUNT_ID"
  fi
}

put_secret_from_env_or_prompt SUPABASE_URL
put_secret_from_env_or_prompt SUPABASE_SERVICE_ROLE_KEY

if [ -n "${ENCRYPTION_KEY:-}" ]; then
  echo "-> ENCRYPTION_KEY: using value from environment (shared on purpose)"
  KEY_TO_USE="$ENCRYPTION_KEY"
else
  echo "-> ENCRYPTION_KEY: generating a fresh random key for THIS server"
  KEY_TO_USE="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
fi
printf '%s' "$KEY_TO_USE" | npx wrangler secret put ENCRYPTION_KEY --name "$NAME" --account-id "$ACCOUNT_ID"

echo ""
echo "Done. Copy the Worker URL printed above into /sa -> Media Servers."
