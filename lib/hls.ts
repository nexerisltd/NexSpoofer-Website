import { encryptUrl } from "./crypto";

function resolveUri(uri: string, base: URL): string {
  return new URL(uri, base).toString();
}

function proxyPathFor(linkPublicId: string, absoluteUrl: string): string {
  const token = encryptUrl(absoluteUrl);
  return `/api/media/${linkPublicId}/seg/${token}`;
}

const URI_ATTR_RE = /URI="([^"]+)"/;

/**
 * Rewrites every URI reference in an HLS playlist (master or media) so the
 * client only ever talks to our own /api/media/... proxy — never the real
 * origin. Handles:
 *  - bare URI lines (variant playlists in a master; segments in a media
 *    playlist)
 *  - #EXT-X-KEY / #EXT-X-MAP URI="..." attributes
 * Line-based rather than a full re-serialize through a parser, so any tag
 * we don't specifically touch passes through untouched/lossless.
 */
export function rewriteManifest(manifestText: string, baseUrl: URL, linkPublicId: string): string {
  const lines = manifestText.split(/\r?\n/);
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    if (trimmed.startsWith("#EXT-X-KEY") || trimmed.startsWith("#EXT-X-MAP")) {
      const m = trimmed.match(URI_ATTR_RE);
      if (m) {
        const abs = resolveUri(m[1], baseUrl);
        const proxied = proxyPathFor(linkPublicId, abs);
        return line.replace(URI_ATTR_RE, `URI="${proxied}"`);
      }
      return line;
    }

    if (trimmed.startsWith("#")) return line; // other tags pass through untouched

    // A bare non-comment line is a URI: a variant playlist (master) or a
    // segment (media playlist) — either way, proxy it.
    const abs = resolveUri(trimmed, baseUrl);
    return proxyPathFor(linkPublicId, abs);
  });
  return out.join("\n");
}
