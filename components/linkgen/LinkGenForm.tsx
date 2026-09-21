"use client";

import { useState } from "react";
import { Link2, Shield, ArrowRight, Copy, Check } from "lucide-react";

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
    <div className="glass-card" style={{ maxWidth: 560, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
        <div className="icon-badge">
          <Link2 size={20} />
        </div>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 4px" }}>Generate Media Link</h1>
          <p className="muted" style={{ margin: 0 }}>
            Paste an authorized media URL to create a shareable NexSpoofer link.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 18 }}>
          <label className="field-label" htmlFor="mediaUrl">
            <Link2 size={13} /> Media URL
          </label>
          <div className="field-input-wrap">
            <span className="field-icon">
              <Link2 size={15} />
            </span>
            <input
              id="mediaUrl"
              className="field-input"
              placeholder="Paste your authorized media URL…"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              required
            />
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label className="field-label" htmlFor="refererUrl">
            <Shield size={13} /> Referrer URL (optional)
          </label>
          <div className="field-input-wrap">
            <span className="field-icon">
              <Link2 size={15} />
            </span>
            <input
              id="refererUrl"
              className="field-input"
              placeholder="Optional referrer URL…"
              value={refererUrl}
              onChange={(e) => setRefererUrl(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <button className="btn-primary" type="submit" disabled={loading}>
          <Link2 size={16} />
          {loading ? "Generating…" : "Generate Link"}
          {!loading && <ArrowRight size={16} />}
        </button>
      </form>

      {result && (
        <div className="generated-link-box">
          <span style={{ flex: 1 }}>{result.url}</span>
          <button className="btn-sm btn-sm-primary" onClick={copyLink}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied!" : "Copy Link"}
          </button>
        </div>
      )}
    </div>
  );
}
