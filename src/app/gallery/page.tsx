"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Brand from "@/components/Brand";
import { explorerTxUrl, explorerAddressUrl } from "@/lib/config";

type Pixel = { x: number; y: number; color: string };
type Bbox = { minX: number; minY: number; maxX: number; maxY: number };
type Placement = {
  sig: string;
  owner: string;
  creator: string | null;
  pixelsClaimed: number;
  link: string | null;
  createdAt: string;
  bbox: Bbox | null;
  pixels: Pixel[];
};

const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
const PURPLE = "#9945FF";

function Thumb({ pixels, bbox }: { pixels: Pixel[]; bbox: Bbox | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !bbox) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = 132;
    canvas.width = size;
    canvas.height = size;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    const w = bbox.maxX - bbox.minX + 1;
    const h = bbox.maxY - bbox.minY + 1;
    const scale = Math.max(1, Math.floor(Math.min(size / w, size / h))) || 1;
    const offX = (size - w * scale) / 2;
    const offY = (size - h * scale) / 2;
    for (const p of pixels) {
      ctx.fillStyle = p.color;
      ctx.fillRect(
        offX + (p.x - bbox.minX) * scale,
        offY + (p.y - bbox.minY) * scale,
        scale,
        scale,
      );
    }
  }, [pixels, bbox]);

  return (
    <canvas
      ref={ref}
      style={{
        width: 132,
        height: 132,
        borderRadius: 8,
        border: "1px solid #e6e6ec",
        background: "#fff",
        flexShrink: 0,
      }}
    />
  );
}

export default function GalleryPage() {
  const [placements, setPlacements] = useState<Placement[] | null>(null);

  useEffect(() => {
    fetch("/api/placements", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setPlacements(d.placements ?? []))
      .catch(() => setPlacements([]));
  }, []);

  return (
    <div style={{ height: "100dvh", overflowY: "auto", background: "#fff" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          padding: "14px 20px",
          borderBottom: "1px solid #ececf0",
          boxShadow: "0 2px 0 0 rgba(153,69,255,0.12)",
        }}
      >
        <Brand size={15} />
        <a
          href="https://x.com/MillionSolHome"
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginLeft: "auto", color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}
        >
          𝕏 @MillionSolHome
        </a>
        <Link
          href="/"
          style={{ marginLeft: 18, color: PURPLE, fontWeight: 600, fontSize: 14 }}
        >
          ← Back to the canvas
        </Link>
      </header>

      <main style={{ maxWidth: 820, margin: "0 auto", padding: "40px 24px 80px" }}>
        <h1
          style={{
            fontFamily: "var(--font-pixel)",
            fontSize: 20,
            lineHeight: 1.4,
            backgroundImage: "linear-gradient(90deg, #9945FF, #14F195)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Gallery
        </h1>
        <p style={{ color: "#666", marginTop: 12, fontSize: 15 }}>
          Every drawing placed on the board and the on-chain burn that eternalized it.
        </p>

        {placements === null && (
          <p style={{ color: "#999", marginTop: 32 }}>Loading…</p>
        )}
        {placements?.length === 0 && (
          <p style={{ color: "#999", marginTop: 32 }}>
            No drawings yet — be the first to paint the board.
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 28 }}>
          {placements?.map((p) => (
            <div
              key={p.sig}
              style={{
                display: "flex",
                gap: 16,
                padding: 14,
                borderRadius: 10,
                border: "1px solid #ececf0",
                alignItems: "center",
              }}
            >
              <Thumb pixels={p.pixels} bbox={p.bbox} />
              <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 13, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {p.creator || "Anonymous"}
                </div>
                <div style={{ color: "#666" }}>
                  {p.pixelsClaimed.toLocaleString()} px ·{" "}
                  {new Date(p.createdAt).toLocaleString()}
                </div>
                <a
                  href={explorerAddressUrl(p.owner)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#1280d6" }}
                >
                  wallet: {short(p.owner)} ↗
                </a>
                <a
                  href={explorerTxUrl(p.sig)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: PURPLE, fontWeight: 600 }}
                >
                  ⛓ burn tx: {short(p.sig)} ↗
                </a>
                {p.link && (
                  <a
                    href={p.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "#1280d6",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    🔗 {p.link}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
