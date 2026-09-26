#!/usr/bin/env node
// Usage: node deploy-server.mjs <worker-name> <account-id>
//
// Run from inside the worker/ folder. Requires `npx wrangler login` already
// done, and you already an accepted Member on the target account — see
// DEPLOY-MULTIPLE.md.
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY: set them as environment
// variables first and this reuses them silently; otherwise wrangler
// prompts you directly. ENCRYPTION_KEY is generated fresh per server
// unless you explicitly set it yourself.

import { deployServer } from "./deploy-lib.mjs";

const [, , name, accountId] = process.argv;
if (!name || !accountId) {
  console.error("Usage: node deploy-server.mjs <worker-name> <account-id>");
  process.exit(1);
}

try {
  deployServer(name, accountId);
} catch (e) {
  console.error(`\nFailed to deploy '${name}': ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
