export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ENCRYPTION_KEY: string;
  ALLOWED_MEDIA_HOSTS?: string;
  ALLOWED_ORIGIN: string;
}

export type MediaLink = {
  id: string;
  public_id: string;
  media_type: "hls" | "direct";
  media_url: string;
  referer_url: string | null;
  status: "active" | "revoked";
  expires_at: string | null;
  hit_count: number;
};
