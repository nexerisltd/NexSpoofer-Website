import type { Env, MediaLink } from "./types";

function restHeaders(env: Env, extra?: HeadersInit): HeadersInit {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function getLinkByPublicId(env: Env, publicId: string): Promise<MediaLink | null> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/media_links?public_id=eq.${encodeURIComponent(publicId)}&select=*`,
    { headers: restHeaders(env) }
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as MediaLink[];
  return rows[0] ?? null;
}

export async function getApprovedHostsFromDb(env: Env): Promise<string[]> {
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/allowed_media_domains?enabled=eq.true&select=hostname`,
      { headers: restHeaders(env) }
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as { hostname: string }[];
    return rows.map((r) => r.hostname.toLowerCase());
  } catch {
    return [];
  }
}

/** Fire-and-forget — not worth blocking the media response on. */
export function bumpHitCount(env: Env, id: string, currentCount: number): void {
  fetch(`${env.SUPABASE_URL}/rest/v1/media_links?id=eq.${id}`, {
    method: "PATCH",
    headers: restHeaders(env, { Prefer: "return=minimal" }),
    body: JSON.stringify({ hit_count: (currentCount ?? 0) + 1 }),
  }).catch(() => {});
}
