import {
  ParsedInstruction,
  PartiallyDecodedInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { getConnection } from "./solana";
import { TOKEN_MINT, MEMO_PROGRAM_ID } from "./config";

const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

export type VerifiedBurn = {
  authority: string;
  amount: number;
  memo: string | null;
};

function isParsed(
  ix: ParsedInstruction | PartiallyDecodedInstruction,
): ix is ParsedInstruction {
  return (ix as ParsedInstruction).parsed !== undefined;
}

// Extract the memo string from a memo-program instruction (parsed or raw).
function readMemo(
  ix: ParsedInstruction | PartiallyDecodedInstruction,
): string | null {
  if (ix.programId.toBase58() !== MEMO_PROGRAM_ID) return null;
  if (isParsed(ix)) {
    // The memo parser puts the string directly in `parsed`.
    return typeof ix.parsed === "string" ? ix.parsed : null;
  }
  try {
    return Buffer.from(bs58.decode(ix.data)).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Fetches a transaction by signature and confirms it contains an SPL burn of
 * the configured mint. Returns the burn authority, the amount burned, and the
 * on-chain memo (the placement's region + link). Throws on any problem.
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

  let memo: string | null = null;
  for (const ix of instructions) {
    const m = readMemo(ix);
    if (m !== null) memo = m;
  }
  // Fallback: some RPCs don't expose the memo as a parsed instruction, but the
  // memo program logs it. Logs look like: Program log: Memo (len N): "..."
  if (!memo && tx.meta?.logMessages) {
    for (const line of tx.meta.logMessages) {
      const match = line.match(/Memo \(len \d+\): "(.*)"$/);
      if (match) memo = match[1];
    }
  }

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

    return { authority, amount, memo };
  }

  throw new Error("No matching burn instruction found in transaction.");
}
