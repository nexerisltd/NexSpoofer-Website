import type { Env } from "./types";

// Same purpose as the Next.js app's original lib/crypto.ts, but using the
// Web Crypto API (crypto.subtle) instead of Node's `node:crypto` — Workers
// don't have the Node module. This never needs to interoperate with the
// Next.js side's token format: encryption (manifest rewrite) and
// decryption (segment route) both happen inside this same Worker now.

async function getKey(env: Env): Promise<CryptoKey> {
  if (!env.ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY is not set");
  const raw = new TextEncoder().encode(env.ENCRYPTION_KEY);
  const hash = await crypto.subtle.digest("SHA-256", raw); // derive a 32-byte key
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function encryptUrl(env: Env, url: string): Promise<string> {
  const key = await getKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(url);
  // Web Crypto's AES-GCM ciphertext already has the 16-byte auth tag
  // appended — no separate getAuthTag() step needed like Node's crypto.
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const combined = new Uint8Array(iv.byteLength + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.byteLength);
  return toBase64Url(combined.buffer);
}

export async function decryptUrl(env: Env, token: string): Promise<string> {
  const key = await getKey(env);
  const bytes = fromBase64Url(token);
  const iv = bytes.slice(0, 12);
  const data = bytes.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(plain);
}
