"use client";

import { useState } from "react";

export default function LinkGenForm() {
  const [mediaUrl, setMediaUrl] = useState("");
  const [refererUrl, setRefererUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/linkgen/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaUrl, refererUrl }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error?.message || "Something went wrong.");
      } else {
        setResult({ url: data.url });
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  function copyLink() {
    if (!result) return;
    navigator.clipboard.writeText(result.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="glass-card" style={{ maxWidth: 520 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Generate Media Link</h1>
      <p className="muted">Paste an authorized media URL to create a shareable NexSpoofer link.</p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label className="field-label" htmlFor="mediaUrl">Media URL</label>
          <input
            id="mediaUrl"
            className="field-input"
            placeholder="Paste your authorized media URL…"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            required
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label className="field-label" htmlFor="refererUrl">Referer URL (optional)</label>
          <input
            id="refererUrl"
            className="field-input"
            placeholder="Optional referer URL…"
            value={refererUrl}
            onChange={(e) => setRefererUrl(e.target.value)}
          />
        </div>

        {error && <div className="error-banner">{error}</div>}

        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Generating…" : "Generate Link"}
        </button>
      </form>

      {result && (
        <div className="generated-link-box">
          <span style={{ flex: 1 }}>{result.url}</span>
          <button className="btn-primary" style={{ width: "auto", padding: "6px 12px" }} onClick={copyLink}>
            {copied ? "Copied!" : "Copy Link"}
          </button>
        </div>
      )}
    </div>
  );
}
