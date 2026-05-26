// Sends tokens from the authority wallet to a recipient (for testing painting).
//
// Usage: npm run send-tokens -- <RECIPIENT_PUBKEY> <AMOUNT>

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "dotenv/config";
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  transfer,
} from "@solana/spl-token";

async function main() {
  const [recipientArg, amountArg] = process.argv.slice(2);
  if (!recipientArg || !amountArg) {
    console.error("Usage: npm run send-tokens -- <RECIPIENT_PUBKEY> <AMOUNT>");
    process.exit(1);
  }
  const recipient = new PublicKey(recipientArg);
  const amount = Number(amountArg);

  const mintStr = process.env.NEXT_PUBLIC_TOKEN_MINT;
  if (!mintStr) throw new Error("NEXT_PUBLIC_TOKEN_MINT not set. Run create-token first.");
  const mint = new PublicKey(mintStr);

  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC ?? clusterApiUrl("devnet");
  const connection = new Connection(rpc, "confirmed");

  const path = resolve(process.env.TOKEN_AUTHORITY_KEYPAIR ?? "./.keys/authority.json");
  const authority = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]),
  );

  const fromAta = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    mint,
    authority.publicKey,
  );
  const toAta = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    mint,
    recipient,
  );

  const sig = await transfer(
    connection,
    authority,
    fromAta.address,
    toAta.address,
    authority,
    amount,
  );

  console.log(`Sent ${amount} tokens to ${recipient.toBase58()}`);
  console.log(`Tx: ${sig}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
