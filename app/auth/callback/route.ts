import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// Only ever redirect to a same-site path — must start with a single "/"
// and never "//" (which browsers treat as protocol-relative, i.e. an
// open redirect to another host).
function safeNextPath(raw: string | null): string {
  if (!raw) return "/LinkGen";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/LinkGen";
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
