import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

// Rewritten HLS manifests need to point sub-resource requests (segments,
// keys, nested playlists) back at our own proxy without exposing the real
// origin URL. Rather than a shared server-side lookup table (which would
// need a shared store across serverless invocations — an in-memory Map
// would NOT reliably survive between two Vercel function calls), each
// origin URL is authenticated-encrypted directly into the path segment.
// This is genuinely stateless, but per spec §3: "obfuscation, not
// cryptographic secrecy" against someone who controls ENCRYPTION_KEY or
// decompiles the token structure — it's still meant to stop casual
// exposure (page source, DevTools "view source"), not a determined actor
// with the key.

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not set");
  return createHash("sha256").update(raw).digest(); // derive a 32-byte AES-256 key
}

export function encryptUrl(url: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(url, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptUrl(token: string): string {
  const key = getKey();
  const buf = Buffer.from(token, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}
