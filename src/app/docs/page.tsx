import Link from "next/link";
import Brand from "@/components/Brand";
import {
  TOKENS_PER_PIXEL,
  MAX_CLAIM_SIZE,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from "@/lib/config";

export const metadata = {
  title: "How it works — Million Solana Homepage",
};

const PURPLE = "#9945FF";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 36 }}>
      <h2
        style={{
          fontFamily: "var(--font-pixel)",
          fontSize: 14,
          color: "#1a1a1a",
          marginBottom: 14,
        }}
      >
        {title}
      </h2>
      <div style={{ fontSize: 15, lineHeight: 1.7, color: "#33333a" }}>{children}</div>
    </section>
  );
}

export default function DocsPage() {
  const totalPixels = CANVAS_WIDTH * CANVAS_HEIGHT;
  const capacity = totalPixels * TOKENS_PER_PIXEL;

  return (
    <div style={{ minHeight: "100dvh", overflowY: "auto", background: "#fff" }}>
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
        <Link
          href="/"
          style={{
            marginLeft: "auto",
            color: PURPLE,
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          ← Back to the canvas
        </Link>
      </header>

      <main
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "48px 24px 80px",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-pixel)",
            fontSize: 22,
            lineHeight: 1.4,
            backgroundImage: "linear-gradient(90deg, #9945FF, #14F195)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          How it works
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.7, color: "#555", marginTop: 16 }}>
          The Million Solana Homepage is a shared{" "}
          {CANVAS_WIDTH.toLocaleString()}×{CANVAS_HEIGHT.toLocaleString()} pixel
          canvas on Solana. You permanently claim pixels by{" "}
          <strong>burning $PIXEL tokens</strong> — once a pixel is painted, it is
          yours forever and can never be overwritten.
        </p>

        <Section title="The $PIXEL token">
          <p>
            $PIXEL is an SPL token on Solana. The only thing it does is buy you
            space on the canvas. There is no admin who can edit your pixels and no
            way to &ldquo;unburn&rdquo; — every pixel placed is final. The total
            supply is sized so the entire board can be filled exactly once:
          </p>
          <ul style={{ marginTop: 10, paddingLeft: 22 }}>
            <li>
              {totalPixels.toLocaleString()} pixels × {TOKENS_PER_PIXEL} tokens ={" "}
              <strong>{capacity.toLocaleString()} $PIXEL</strong> total burn
              capacity.
            </li>
          </ul>
        </Section>

        <Section title="The price: 1 pixel = 10 tokens">
          <p>
            Every pixel you paint costs <strong>{TOKENS_PER_PIXEL} $PIXEL</strong>,
            which are <em>burned</em> (destroyed) the moment you place your art.
            If you draw 50 pixels, {50 * TOKENS_PER_PIXEL} tokens leave circulation
            forever. This makes the canvas a permanent, deflationary record of who
            showed up.
          </p>
        </Section>

        <Section title="Step 1 — Claim a region">
          <p>
            Before drawing, you select a rectangular region on the canvas using the{" "}
            <strong>Select</strong>{" "}tool. You can only draw inside the region you
            claimed, which keeps everyone&rsquo;s art from colliding. Each wallet
            may claim a region up to{" "}
            <strong>
              {MAX_CLAIM_SIZE}×{MAX_CLAIM_SIZE}
            </strong>{" "}
            pixels ({(MAX_CLAIM_SIZE * MAX_CLAIM_SIZE).toLocaleString()} pixels max
            per wallet).
          </p>
        </Section>

        <Section title="Step 2 — Draw or paste an image">
          <p>
            Inside your region you can free-draw with an adjustable brush size and
            color, or upload / paste (Ctrl+V) an image. Images are scaled down to
            the pixel width you choose, so a photo becomes pixel art that fits your
            claimed space.
          </p>
        </Section>

        <Section title="Step 3 — Burn &amp; place">
          <p>
            When you&rsquo;re happy, hit <strong>Burn &amp; Place</strong>. Your
            wallet signs a single transaction that burns the right amount of $PIXEL.
            The site verifies the burn on-chain (correct token, correct amount,
            signed by you, never reused) and only then writes your pixels to the
            board. If the burn doesn&rsquo;t check out, nothing is placed.
          </p>
        </Section>

        <Section title="Permanence &amp; conflicts">
          <p>
            A painted pixel can never be changed or painted over by anyone,
            including you. If you try to place on a pixel someone already owns, the
            placement is rejected before you burn. First to paint a pixel owns it
            for good.
          </p>
        </Section>

        <div
          style={{
            marginTop: 48,
            padding: "16px 18px",
            borderRadius: 10,
            background: "#faf7ff",
            border: "1px solid #ecdcff",
            fontSize: 14,
            color: "#5a4a7a",
          }}
        >
          Ready? <Link href="/" style={{ color: PURPLE, fontWeight: 700 }}>Go to the canvas</Link>,
          connect your wallet, and claim your spot.
        </div>
      </main>
    </div>
  );
}
