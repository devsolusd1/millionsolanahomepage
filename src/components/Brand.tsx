import Link from "next/link";

const BLUE = "#2B4DFF";
const INK = "#111111";

// Pixel-frame logo: a blue notched frame with a black drop-shadow and the
// descending blocks (two blue rows, one black row).
function LogoMark({ px }: { px: number }) {
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 256 256"
      aria-hidden
      style={{ display: "block", flexShrink: 0 }}
    >
      <path
        d="M80 52 H176 V70 H204 V186 H176 V204 H80 V186 H52 V70 H80 Z"
        transform="translate(9,9)"
        fill="none"
        stroke="#0A0A0A"
        strokeWidth="16"
        strokeLinejoin="miter"
      />
      <path
        d="M80 52 H176 V70 H204 V186 H176 V204 H80 V186 H52 V70 H80 Z"
        fill="none"
        stroke={BLUE}
        strokeWidth="16"
        strokeLinejoin="miter"
      />
      <rect x="118" y="100" width="16" height="16" fill={BLUE} />
      <rect x="140" y="100" width="16" height="16" fill={BLUE} />
      <rect x="106" y="124" width="16" height="16" fill={BLUE} />
      <rect x="128" y="124" width="16" height="16" fill={BLUE} />
      <rect x="94" y="148" width="16" height="16" fill="#0A0A0A" />
      <rect x="116" y="148" width="16" height="16" fill="#0A0A0A" />
      <rect x="138" y="148" width="16" height="16" fill="#0A0A0A" />
    </svg>
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
      <LogoMark px={Math.round(size * 2.1)} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          style={{
            fontFamily: "var(--font-pixel)",
            fontSize: size,
            lineHeight: 1.1,
            letterSpacing: 0.5,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ color: BLUE }}>MILLION</span>{" "}
          <span style={{ color: INK }}>SOLANA</span>
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
