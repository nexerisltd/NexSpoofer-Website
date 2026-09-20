import type { Env } from "./types";

export function getEnvAllowedHosts(env: Env): string[] {
  return (env.ALLOWED_MEDIA_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function isHostnameAllowed(hostname: string, allowlist: string[]): boolean {
  const host = hostname.toLowerCase();
  return allowlist.some((allowed) => host === allowed || host.endsWith("." + allowed));
}

function baseDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split(".");
  return parts.slice(-2).join(".");
}

export function isSameOrigin(hostname: string, originHostname: string): boolean {
  return baseDomain(hostname) === baseDomain(originHostname);
}

// Cheap, DNS-free fail-fast for obviously-private hostnames/IP literals.
// This is a SECONDARY check — Cloudflare Workers' own fetch() already
// refuses to open a connection to RFC1918/loopback/link-local addresses
// at the platform/runtime level, which is the actual hard SSRF boundary
// here (unlike the Vercel/Node side, which had to build that check itself
// with dns.lookup since Node has no such built-in restriction).
const PRIVATE_LITERAL_RE =
  /^(127\.|10\.|192\.168\.|169\.254\.|100\.6[4-9]\.|100\.[7-9]\d\.|100\.1[01]\d\.|100\.12[0-7]\.|172\.(1[6-9]|2\d|3[01])\.)/;

export function looksPrivate(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h === "::1") return true;
  if (h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (PRIVATE_LITERAL_RE.test(h)) return true;
  return false;
}

export function assertSafeUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Unsupported protocol");
  }
  if (looksPrivate(url.hostname)) {
    throw new Error("Blocked hostname");
  }
  return url;
}
