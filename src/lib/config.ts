// Shared configuration for the Million Solana Homepage.
// Values are read from env where they differ per-environment.

// Sized so the whole board can absorb exactly the 1B token supply being burned:
// 10_000 * 10_000 = 1e8 pixels * 10 tokens = 1e9 (1B) tokens.
export const CANVAS_WIDTH = 10_000;
export const CANVAS_HEIGHT = 10_000;

// Burn economics: each pixel costs this many tokens (whole tokens, decimals = 0).
export const TOKENS_PER_PIXEL = 10;

// Max claim region size per wallet (in pixels, per side) and the resulting
// total number of pixels a single wallet may ever own.
export const MAX_CLAIM_SIZE = 300;
export const MAX_PIXELS_PER_WALLET = MAX_CLAIM_SIZE * MAX_CLAIM_SIZE; // 40_000

// Minimum time between placements for a single wallet.
export const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

// Wallets exempt from the cooldown (none in production).
export const COOLDOWN_EXEMPT = new Set<string>([]);

// Cooldown duration in minutes, for display.
export const COOLDOWN_MIN = Math.round(COOLDOWN_MS / 60000);

// Max length of the creator name.
export const MAX_NAME_LENGTH = 40;

// SPL Memo program — used to embed {link, region} in the burn tx.
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

// SPL token mint address. Defaults to the live $PIXEL mint; overridable via env.
export const TOKEN_MINT =
  process.env.NEXT_PUBLIC_TOKEN_MINT ??
  "cUbwihy5snkLwyWM7UPJd5CfMe476USqkcQRuMPiXEL";

// Token decimals — MUST match the mint (the live $PIXEL token has 6).
export const TOKEN_DECIMALS = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS ?? 6);

// Base units (smallest unit) that `pixels` cost, accounting for decimals.
// E.g. 1 pixel = 10 whole tokens = 10 * 10^decimals base units.
export function pixelCostBaseUnits(pixels: number): number {
  return pixels * TOKENS_PER_PIXEL * Math.pow(10, TOKEN_DECIMALS);
}

// Solana RPC endpoint.
export const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";

export const SOLANA_CLUSTER = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ??
  "devnet") as "devnet" | "mainnet-beta" | "testnet";

// Optional pre-launch gate: the site is live by default. Set
// NEXT_PUBLIC_COMING_SOON="true" to show a "coming soon" screen instead.
export const COMING_SOON = process.env.NEXT_PUBLIC_COMING_SOON === "true";

// Solscan link for a transaction signature (cluster-aware).
export function explorerTxUrl(signature: string): string {
  const suffix =
    SOLANA_CLUSTER === "mainnet-beta" ? "" : `?cluster=${SOLANA_CLUSTER}`;
  return `https://solscan.io/tx/${signature}${suffix}`;
}

// Solscan link for a wallet address (cluster-aware).
export function explorerAddressUrl(address: string): string {
  const suffix =
    SOLANA_CLUSTER === "mainnet-beta" ? "" : `?cluster=${SOLANA_CLUSTER}`;
  return `https://solscan.io/account/${address}${suffix}`;
}
