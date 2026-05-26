"use client";

import { useState } from "react";
import { TOKEN_MINT } from "@/lib/config";

function truncate(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export default function TokenAddress() {
  const [copied, setCopied] = useState(false);
  const deployed = !!TOKEN_MINT;

  const copy = async () => {
    if (!deployed) return;
    await navigator.clipboard.writeText(TOKEN_MINT);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      onClick={copy}
      title={deployed ? `Copy contract address: ${TOKEN_MINT}` : "Token not deployed yet"}
      disabled={!deployed}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 8,
        border: "1px solid #e3e3e8",
        background: "#fff",
        cursor: deployed ? "pointer" : "default",
        fontFamily: "var(--font-geist-mono), monospace",
        fontSize: 12,
        color: "#333",
      }}
    >
      <span
        style={{
          fontSize: 9,
          letterSpacing: 1,
          color: "#9945FF",
          fontWeight: 700,
        }}
      >
        CA
      </span>
      <span>{deployed ? truncate(TOKEN_MINT) : "not deployed"}</span>
      {deployed && (
        <span style={{ color: copied ? "#14b87a" : "#999", fontSize: 11 }}>
          {copied ? "copied!" : "copy"}
        </span>
      )}
    </button>
  );
}
