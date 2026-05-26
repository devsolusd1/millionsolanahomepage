import {
  ParsedInstruction,
  PartiallyDecodedInstruction,
} from "@solana/web3.js";
import { getConnection } from "./solana";
import { TOKEN_MINT } from "./config";

const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

export type VerifiedBurn = {
  authority: string;
  amount: number;
};

function isParsed(
  ix: ParsedInstruction | PartiallyDecodedInstruction,
): ix is ParsedInstruction {
  return (ix as ParsedInstruction).parsed !== undefined;
}

/**
 * Fetches a transaction by signature and confirms it contains an SPL burn of
 * the configured mint. Returns the burn authority (the wallet) and the amount
 * of tokens burned. Throws with a descriptive message if anything fails.
 */
export async function verifyBurn(signature: string): Promise<VerifiedBurn> {
  if (!TOKEN_MINT) throw new Error("Server token mint is not configured.");

  const connection = getConnection();
  const tx = await connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });

  if (!tx) throw new Error("Transaction not found or not yet confirmed.");
  if (tx.meta?.err) throw new Error("Transaction failed on-chain.");

  const instructions = tx.transaction.message.instructions;

  for (const ix of instructions) {
    if (!isParsed(ix)) continue;
    if (ix.program !== "spl-token" && ix.programId.toBase58() !== SPL_TOKEN_PROGRAM)
      continue;

    const type = ix.parsed?.type;
    if (type !== "burn" && type !== "burnChecked") continue;

    const info = ix.parsed.info as {
      mint: string;
      authority?: string;
      multisigAuthority?: string;
      amount?: string;
      tokenAmount?: { amount: string };
    };

    if (info.mint !== TOKEN_MINT) continue;

    const rawAmount =
      type === "burnChecked" ? info.tokenAmount?.amount : info.amount;
    if (!rawAmount) continue;

    const amount = Number(rawAmount);
    const authority = info.authority ?? info.multisigAuthority;
    if (!authority) continue;

    return { authority, amount };
  }

  throw new Error("No matching burn instruction found in transaction.");
}
