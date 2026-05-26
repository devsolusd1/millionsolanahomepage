import {
  Connection,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  createBurnCheckedInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { TOKEN_MINT, TOKEN_DECIMALS, TOKENS_PER_PIXEL } from "./config";

type SendFn = (
  tx: Transaction,
  connection: Connection,
) => Promise<string>;

/**
 * Builds and sends a burn transaction for `pixelCount` pixels worth of tokens,
 * then waits for confirmation. Returns the transaction signature.
 */
export async function burnForPixels(
  connection: Connection,
  owner: PublicKey,
  pixelCount: number,
  sendTransaction: SendFn,
): Promise<string> {
  if (!TOKEN_MINT) throw new Error("Token mint is not configured.");
  const mint = new PublicKey(TOKEN_MINT);
  const amount = pixelCount * TOKENS_PER_PIXEL;

  const ata = await getAssociatedTokenAddress(mint, owner);

  const ix = createBurnCheckedInstruction(
    ata,
    mint,
    owner,
    amount,
    TOKEN_DECIMALS,
  );

  const tx = new Transaction().add(ix);
  tx.feePayer = owner;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  const signature = await sendTransaction(tx, connection);
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );

  return signature;
}
