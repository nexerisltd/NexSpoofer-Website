"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";

function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/LinkGen";

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Forwarding `next` here is what makes the post-login redirect
        // land back on the page the user actually wanted (e.g. a shared
        // /p/[id] link) instead of always defaulting to /LinkGen.
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <main className="stage">
      <div className="glass-card login-card">
        <Image src="/logo.png" alt="NexSpoofer" width={56} height={56} style={{ margin: "0 auto 14px" }} priority />
        <div className="brand-mark">NexSpoofer</div>
        <p className="muted">Sign in to continue.</p>

        {error && <div className="error-banner">{error}</div>}

        <button className="btn-primary" onClick={signInWithGoogle} disabled={loading}>
          {loading ? "Redirecting…" : "Sign in with Google"}
        </button>
      </div>
    </main>
  );
}

export default function LoginPage() {
  // useSearchParams() requires a Suspense boundary in the app router.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
