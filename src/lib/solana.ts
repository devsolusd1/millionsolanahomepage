import { Connection, PublicKey } from "@solana/web3.js";
import { SOLANA_RPC } from "./config";

let cached: Connection | null = null;

export function getConnection(): Connection {
  if (!cached) cached = new Connection(SOLANA_RPC, "confirmed");
  return cached;
}

export function toPubkey(value: string): PublicKey {
  return new PublicKey(value);
}
