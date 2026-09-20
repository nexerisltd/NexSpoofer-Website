import dns from "node:dns/promises";
import net from "node:net";

// --- private / internal IP range checks (core SSRF defense) ---------------

const PRIVATE_V4_RANGES: [string, number][] = [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["0.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
];

function ipv4ToLong(ip: string): number {
  return (
    ip
      .split(".")
      .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
  );
}

function isPrivateIPv4(ip: string): boolean {
  const long = ipv4ToLong(ip);
  return PRIVATE_V4_RANGES.some(([base, bits]) => {
    const baseLong = ipv4ToLong(base);
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (long & mask) === (baseLong & mask);
  });
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return (
    lower === "::1" ||
    lower.startsWith("::ffff:127.") ||
    lower.startsWith("fe80:") || // link-local
    lower.startsWith("fc") || // unique local fc00::/7
    lower.startsWith("fd")
  );
}

export class UnsafeUrlError extends Error {}

/**
 * Validates a URL is safe for the SERVER to fetch on behalf of a user:
 *  - http(s) only
 *  - hostname must not resolve to a private/loopback/link-local address
 *
 * Known limitation: this resolves DNS once here and fetch() resolves again
 * when the request is actually made, which leaves a small window for a
 * DNS-rebinding attack (the record could change between the two lookups).
 * A fully hardened version would pin the checked IP via a custom fetch
 * dispatcher/agent. Flagging this explicitly rather than claiming this is
 * airtight — see README "Known limitations".
 */
export async function assertSafeToFetch(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Unsupported protocol");
  }

  const ipVersion = net.isIP(url.hostname);
  if (ipVersion === 4) {
    if (isPrivateIPv4(url.hostname)) throw new UnsafeUrlError("Blocked private IPv4");
    return url;
  }
  if (ipVersion === 6) {
    if (isPrivateIPv6(url.hostname)) throw new UnsafeUrlError("Blocked private IPv6");
    return url;
  }

  const lower = url.hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local")) {
    throw new UnsafeUrlError("Blocked hostname");
  }

  const results = await dns.lookup(url.hostname, { all: true }).catch(() => {
    throw new UnsafeUrlError("DNS resolution failed");
  });
  for (const r of results) {
    if (r.family === 4 && isPrivateIPv4(r.address)) throw new UnsafeUrlError("Blocked private IP (DNS)");
    if (r.family === 6 && isPrivateIPv6(r.address)) throw new UnsafeUrlError("Blocked private IP (DNS)");
  }
  return url;
}

// --- host allowlist ---------------------------------------------------------

/** Static baseline from the env var. */
export function getEnvAllowedHosts(): string[] {
  return (process.env.ALLOWED_MEDIA_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** Combines the env var baseline with whatever the Super Admin has added
 * via /sa (the allowed_media_domains table) — this is what every route
 * handler should actually call, so domains added in the UI take effect
 * without an env var change + redeploy. */
export async function getAllowedHosts(): Promise<string[]> {
  const envHosts = getEnvAllowedHosts();
  try {
    // Lazy import to avoid a hard circular dependency between security.ts
    // and the Supabase service client module.
    const { createServiceClient } = await import("@/lib/supabase/service");
    const supabase = createServiceClient();
    const { data } = await supabase.from("allowed_media_domains").select("hostname").eq("enabled", true);
    const dbHosts = (data || []).map((r: { hostname: string }) => r.hostname.toLowerCase());
    return Array.from(new Set([...envHosts, ...dbHosts]));
  } catch {
    // DB unreachable — fail back to the static env list rather than
    // opening the allowlist entirely.
    return envHosts;
  }
}

export function isHostnameAllowed(hostname: string, allowlist: string[]): boolean {
  const host = hostname.toLowerCase();
  return allowlist.some((allowed) => host === allowed || host.endsWith("." + allowed));
}

/**
 * The single check every route should call: is this hostname approved to
 * fetch from? Primary control is the Super Admin's "Approved Media
 * Domains" panel at /sa (the allowed_media_domains table); ALLOWED_MEDIA_HOSTS
 * is now just an optional extra baseline (e.g. for a first domain before
 * you've logged in as Super Admin yet), not a required env var.
 *
 * Deny-by-default: if NOTHING is approved yet (env empty AND table empty),
 * this returns false for everything — so a fresh deploy with no domains
 * added in /sa cannot be used to fetch anything, rather than silently
 * allowing every host until someone remembers to lock it down.
 */
export async function isMediaHostApproved(hostname: string): Promise<boolean> {
  const hosts = await getAllowedHosts();
  if (!hosts.length) return false;
  return isHostnameAllowed(hostname, hosts);
}

function baseDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split(".");
  return parts.slice(-2).join(".");
}

/** Loose same-site check used to allow a manifest's own segment/sub-playlist
 * hosts even when they live on a different subdomain than the manifest
 * itself (common for CDNs). Not public-suffix-list aware — good enough for
 * an MVP allowlist companion check, not a strict security boundary on its
 * own (assertSafeToFetch's private-IP block is the hard boundary). */
export function isSameOrigin(hostname: string, originHostname: string): boolean {
  return baseDomain(hostname) === baseDomain(originHostname);
}
