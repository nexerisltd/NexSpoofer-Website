"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
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
