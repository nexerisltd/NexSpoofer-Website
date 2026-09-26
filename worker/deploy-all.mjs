#!/usr/bin/env node
// Usage: node deploy-all.mjs
// Reads servers.txt (copy servers.example.txt to servers.txt and fill in
// real account IDs from `npx wrangler whoami` first).

import { readFileSync, existsSync } from "node:fs";
import { deployServer } from "./deploy-lib.mjs";

const CONFIG = "servers.txt";
if (!existsSync(CONFIG)) {
  console.error(`Missing ${CONFIG} — copy servers.example.txt to servers.txt and fill in real account IDs first.`);
  process.exit(1);
}

const lines = readFileSync(CONFIG, "utf8").split(/\r?\n/);
const results = [];

for (const raw of lines) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const [name, accountId] = line.split("=").map((s) => (s || "").trim());
  if (!name || !accountId) continue;

  if (accountId.startsWith("REPLACE_WITH_")) {
    console.log(`\nSkipping '${name}' — servers.txt still has a placeholder account ID for it.`);
    results.push([name, "skipped (placeholder)"]);
    continue;
  }

  console.log(`\n########## ${name} ##########`);
  try {
    deployServer(name, accountId);
    results.push([name, "ok"]);
  } catch (e) {
    console.error(`Failed: ${e instanceof Error ? e.message : e}`);
    results.push([name, "FAILED"]);
  }
}

console.log("\n=== Summary ===");
for (const [name, status] of results) console.log(`${name}: ${status}`);
console.log("\nAdd each successful server's URL in /sa -> Media Servers, then use Check to confirm it's up.");
