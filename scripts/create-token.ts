// Creates a new SPL token on Devnet for the Million Solana Homepage.
//
// - Loads (or generates) a local authority keypair under ./.keys/authority.json
// - Airdrops devnet SOL if the balance is low
// - Creates a mint with 0 decimals
// - Mints an initial supply to the authority's associated token account
// - Writes NEXT_PUBLIC_TOKEN_MINT back into .env
//
// Run with: npm run create-token

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import "dotenv/config";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

// Optional: use a specific keypair as the mint account (so the mint has a
// chosen address). Set MINT_KEYPAIR to a keypair JSON path.
function loadMintKeypair(): Keypair | undefined {
  const path = process.env.MINT_KEYPAIR;
  if (!path) return undefined;
  const secret = JSON.parse(readFileSync(resolve(path), "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

const DECIMALS = 0;
// Default supply: 1 billion tokens. The board (10k x 10k) absorbs exactly 1B
// tokens burned at 10 tokens/pixel, so the full supply can be painted.
const INITIAL_SUPPLY = Number(process.env.INITIAL_SUPPLY ?? 1_000_000_000);

function loadOrCreateAuthority(): Keypair {
  const path = resolve(
    process.env.TOKEN_AUTHORITY_KEYPAIR ?? "./.keys/authority.json",
  );
  if (existsSync(path)) {
    const secret = JSON.parse(readFileSync(path, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  }
  const kp = Keypair.generate();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
  console.log(`Generated new authority keypair at ${path}`);
  return kp;
}

async function ensureFunds(connection: Connection, authority: Keypair) {
  const balance = await connection.getBalance(authority.publicKey);
  console.log(`Authority balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  if (balance >= 0.5 * LAMPORTS_PER_SOL) return;

  console.log("Requesting devnet airdrop (2 SOL)...");
  try {
    const sig = await connection.requestAirdrop(
      authority.publicKey,
      2 * LAMPORTS_PER_SOL,
    );
    const bh = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
    console.log("Airdrop confirmed.");
  } catch (e) {
    console.warn(
      "Airdrop failed (devnet faucet may be rate-limited). " +
        `Fund this address manually then re-run: ${authority.publicKey.toBase58()}`,
    );
    throw e;
  }
}

function updateEnv(mint: string) {
  const envPath = resolve("./.env");
  let content = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const line = `NEXT_PUBLIC_TOKEN_MINT="${mint}"`;
  if (/^NEXT_PUBLIC_TOKEN_MINT=.*$/m.test(content)) {
    content = content.replace(/^NEXT_PUBLIC_TOKEN_MINT=.*$/m, line);
  } else {
    content += `\n${line}\n`;
  }
  writeFileSync(envPath, content);
  console.log("Updated .env with NEXT_PUBLIC_TOKEN_MINT.");
}

async function main() {
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC ?? clusterApiUrl("devnet");
  const connection = new Connection(rpc, "confirmed");
  const authority = loadOrCreateAuthority();
  console.log(`Authority: ${authority.publicKey.toBase58()}`);

  await ensureFunds(connection, authority);

  const mintKeypair = loadMintKeypair();
  if (mintKeypair)
    console.log(`Using provided mint address: ${mintKeypair.publicKey.toBase58()}`);

  console.log("Creating mint...");
  const mint = await createMint(
    connection,
    authority, // fee payer
    authority.publicKey, // mint authority
    authority.publicKey, // freeze authority
    DECIMALS,
    mintKeypair, // optional: chosen mint account keypair
  );
  console.log(`Mint created: ${mint.toBase58()}`);

  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    mint,
    authority.publicKey,
  );

  console.log(`Minting ${INITIAL_SUPPLY.toLocaleString()} tokens...`);
  await mintTo(
    connection,
    authority,
    mint,
    ata.address,
    authority,
    INITIAL_SUPPLY, // raw amount (decimals = 0)
  );

  updateEnv(mint.toBase58());

  console.log("\n=== Done ===");
  console.log(`Mint:      ${mint.toBase58()}`);
  console.log(`Holder:    ${authority.publicKey.toBase58()}`);
  console.log(`ATA:       ${ata.address.toBase58()}`);
  console.log(`Supply:    ${INITIAL_SUPPLY.toLocaleString()} (decimals=${DECIMALS})`);
  console.log(
    "\nSend some of these tokens to your Phantom wallet on Devnet to test painting.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
