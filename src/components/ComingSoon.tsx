import Brand from "@/components/Brand";

export default function ComingSoon() {
  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 26,
        textAlign: "center",
        padding: 24,
        background: "#ffffff",
      }}
    >
      <Brand size={26} href={null} />

      <h1
        style={{
          fontFamily: "var(--font-pixel)",
          fontSize: 34,
          lineHeight: 1.3,
          margin: 0,
          backgroundImage: "linear-gradient(90deg, #9945FF, #14F195)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        Coming soon
      </h1>

      <p style={{ maxWidth: 460, fontSize: 17, lineHeight: 1.7, color: "#555", margin: 0 }}>
        Burn <strong>$PIXEL</strong> to claim and paint pixels on a shared canvas —
        eternalized on-chain on Solana. Launching very soon.
      </p>

      <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
        <a
          href="https://x.com/MillionSolHP"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "11px 22px",
            borderRadius: 8,
            background: "#111",
            color: "#fff",
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          𝕏 Follow @MillionSolHP
        </a>
        <a
          href="/docs"
          style={{
            padding: "11px 22px",
            borderRadius: 8,
            border: "1px solid #d9d9e0",
            color: "#9945FF",
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          How it works
        </a>
      </div>
    </div>
  );
}
