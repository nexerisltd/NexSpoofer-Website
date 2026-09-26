import { execSync } from "node:child_process";
import crypto from "node:crypto";

/**
 * `wrangler deploy` (current versions) has no --account-id flag — see
 * `wrangler deploy --help`'s OPTIONS list, it isn't there. Account
 * selection when your login has access to more than one account is done
 * via the CLOUDFLARE_ACCOUNT_ID environment variable instead (or
 * `account_id` in wrangler.toml, which this project deliberately leaves
 * unset so the same toml can deploy to any account via this env var).
 * https://developers.cloudflare.com/workers/wrangler/profiles/#account-selection
 */
export function deployServer(name, accountId) {
  const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId };

  function run(cmd, input) {
    console.log(`> ${cmd}`);
    execSync(cmd, {
      stdio: input !== undefined ? ["pipe", "inherit", "inherit"] : "inherit",
      input,
      env,
    });
  }

  console.log(`\n=== Deploying '${name}' -> account ${accountId} ===\n`);
  run(`npx wrangler deploy --name ${name}`);

  function putSecret(key, value) {
    console.log(`-> ${key}${value !== undefined ? " (from environment)" : " (wrangler will prompt you)"}`);
    run(`npx wrangler secret put ${key} --name ${name}`, value !== undefined ? `${value}\n` : undefined);
  }

  putSecret("SUPABASE_URL", process.env.SUPABASE_URL);
  putSecret("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);

  const encryptionKey = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");
  if (!process.env.ENCRYPTION_KEY) {
    console.log("-> ENCRYPTION_KEY: generated a fresh random key for THIS server");
  }
  putSecret("ENCRYPTION_KEY", encryptionKey);

  console.log(`\n'${name}' done. Copy the Worker URL printed above into /sa -> Media Servers.`);
}
