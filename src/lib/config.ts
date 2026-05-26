// Shared configuration for the Million Solana Homepage.
// Values are read from env where they differ per-environment.

// Sized so the whole board can absorb ~700 million tokens being burned:
// 8_400 * 8_400 = 7.056e7 pixels * 10 tokens = 7.056e8 (~705.6M) tokens.
export const CANVAS_WIDTH = 8_400;
export const CANVAS_HEIGHT = 8_400;

// Burn economics: each pixel costs this many tokens (whole tokens, decimals = 0).
export const TOKENS_PER_PIXEL = 10;

// Max claim region size per wallet (in pixels, per side) and the resulting
// total number of pixels a single wallet may ever own.
export const MAX_CLAIM_SIZE = 300;
export const MAX_PIXELS_PER_WALLET = MAX_CLAIM_SIZE * MAX_CLAIM_SIZE; // 40_000

// Minimum time between placements for a single wallet.
export const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

// SPL Memo program — used to embed {link, region} in the burn tx.
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

// SPL token mint address (set after running scripts/create-token.ts).
export const TOKEN_MINT = process.env.NEXT_PUBLIC_TOKEN_MINT ?? "";

// Token decimals — we create the mint with 0 decimals so 1 token = 1 base unit.
export const TOKEN_DECIMALS = 0;

// Solana RPC endpoint.
export const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";

export const SOLANA_CLUSTER = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ??
  "devnet") as "devnet" | "mainnet-beta" | "testnet";

// Solana Explorer link for a transaction signature (cluster-aware).
export function explorerTxUrl(signature: string): string {
  const suffix =
    SOLANA_CLUSTER === "mainnet-beta" ? "" : `?cluster=${SOLANA_CLUSTER}`;
  return `https://explorer.solana.com/tx/${signature}${suffix}`;
}
