"use client";

import { useState } from "react";

export default function ImageViewer({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100dvh",
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "auto",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: loaded && !error ? `url(${src})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(40px) brightness(0.5)",
          transform: "scale(1.1)",
        }}
      />
      {!loaded && !error && (
        <div style={{ position: "relative", color: "#eef0fb", fontSize: 13 }}>Loading image…</div>
      )}
      {error && (
        <div className="glass-card" style={{ position: "relative", maxWidth: 360, textAlign: "center" }}>
          This media format is not supported.
        </div>
      )}
      {!error && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          onClick={() => setZoomed((z) => !z)}
          style={{
            position: "relative",
            maxWidth: zoomed ? "none" : "92vw",
            maxHeight: zoomed ? "none" : "92vh",
            width: zoomed ? "auto" : undefined,
            cursor: zoomed ? "zoom-out" : "zoom-in",
            borderRadius: 12,
            boxShadow: "0 20px 60px -20px rgba(0,0,0,0.7)",
            opacity: loaded ? 1 : 0,
            transition: "opacity 200ms ease",
          }}
        />
      )}
    </div>
  );
}
