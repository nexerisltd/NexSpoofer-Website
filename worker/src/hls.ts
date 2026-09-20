import type { Env } from "./types";
import { encryptUrl } from "./crypto";

function resolveUri(uri: string, base: URL): string {
  return new URL(uri, base).toString();
}

const URI_ATTR_RE = /URI="([^"]+)"/;

/**
 * Same logic as the original Next.js lib/hls.ts, ported to be async (Web
 * Crypto's encrypt is Promise-based) and to build fully-qualified proxy
 * URLs pointing at this Worker's own origin (workerBase) rather than a
 * relative path — the manifest is fetched by hls.js running on the
 * Next.js app's origin, a different origin than this Worker.
 */
export async function rewriteManifest(
  env: Env,
  manifestText: string,
  baseUrl: URL,
  linkPublicId: string,
  workerBase: string
): Promise<string> {
  const lines = manifestText.split(/\r?\n/);
  const out: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push(line);
      continue;
    }

    if (trimmed.startsWith("#EXT-X-KEY") || trimmed.startsWith("#EXT-X-MAP")) {
      const m = trimmed.match(URI_ATTR_RE);
      if (m) {
        const abs = resolveUri(m[1], baseUrl);
        const token = await encryptUrl(env, abs);
        out.push(line.replace(URI_ATTR_RE, `URI="${workerBase}/media/${linkPublicId}/seg/${token}"`));
      } else {
        out.push(line);
      }
      continue;
    }

    if (trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }

    const abs = resolveUri(trimmed, baseUrl);
    const token = await encryptUrl(env, abs);
    out.push(`${workerBase}/media/${linkPublicId}/seg/${token}`);
  }

  return out.join("\n");
}
