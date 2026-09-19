import { cookies } from "next/headers";
import { createServerClient as createSSRClient } from "@supabase/ssr";

/** Server-side client that respects the signed-in user's session + RLS.
 * Use this for anything the user themselves should be allowed to see —
 * NOT for admin operations, which go through service.ts instead. */
export async function createServerClient() {
  const cookieStore = await cookies();
  return createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component without cookie write access —
            // middleware.ts is what actually refreshes the session cookie.
          }
        },
      },
    }
  );
}
