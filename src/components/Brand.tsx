import Link from "next/link";

const PURPLE = "#9945FF";
const TEAL = "#19FB9B";
const GREEN = "#14F195";

// Tiny pixel-art mark: three slanted blocks echoing the Solana logo.
function PixelMark({ cell }: { cell: number }) {
  const grid: (string | null)[] = [
    null, PURPLE, PURPLE,
    null, null, null,
    TEAL, TEAL, null,
    null, null, null,
    GREEN, GREEN, GREEN,
  ];
  return (
    <div
      aria-hidden
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(3, ${cell}px)`,
        gridTemplateRows: `repeat(5, ${cell}px)`,
        gap: 1,
      }}
    >
      {grid.map((c, i) => (
        <span key={i} style={{ background: c ?? "transparent", display: "block" }} />
      ))}
    </div>
  );
}

export default function Brand({
  size = 14,
  tagline = true,
  href = "/",
}: {
  size?: number;
  tagline?: boolean;
  href?: string | null;
}) {
  const inner = (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.7 }}>
      <PixelMark cell={Math.round(size * 0.42)} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          style={{
            fontFamily: "var(--font-pixel)",
            fontSize: size,
            lineHeight: 1.1,
            letterSpacing: 0.5,
            backgroundImage: `linear-gradient(90deg, ${PURPLE}, ${GREEN})`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            whiteSpace: "nowrap",
          }}
        >
          MILLION SOLANA
        </span>
        {tagline && (
          <span
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: Math.max(9, size * 0.62),
              letterSpacing: 2,
              color: "#8a8a96",
              textTransform: "uppercase",
            }}
          >
            Homepage
          </span>
        )}
      </div>
    </div>
  );

  if (!href) return inner;
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      {inner}
    </Link>
  );
}
