import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBurn } from "@/lib/verifyBurn";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  TOKENS_PER_PIXEL,
  MAX_CLAIM_SIZE,
  MAX_PIXELS_PER_WALLET,
} from "@/lib/config";

type IncomingPixel = { x: number; y: number; color: string };

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_PIXELS_PER_REQUEST = MAX_PIXELS_PER_WALLET;

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  let body: { signature?: string; wallet?: string; pixels?: IncomingPixel[] };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body.");
  }

  const { signature, wallet, pixels } = body;

  if (typeof signature !== "string" || !signature)
    return bad("Missing burn transaction signature.");
  if (typeof wallet !== "string" || !wallet) return bad("Missing wallet.");
  if (!Array.isArray(pixels) || pixels.length === 0)
    return bad("No pixels provided.");
  if (pixels.length > MAX_PIXELS_PER_REQUEST)
    return bad(`Too many pixels (max ${MAX_PIXELS_PER_REQUEST}).`);

  // Validate each pixel and dedupe by coordinate.
  const seen = new Set<string>();
  for (const p of pixels) {
    if (
      !Number.isInteger(p.x) ||
      !Number.isInteger(p.y) ||
      p.x < 0 ||
      p.y < 0 ||
      p.x >= CANVAS_WIDTH ||
      p.y >= CANVAS_HEIGHT
    ) {
      return bad(`Pixel out of bounds: (${p.x}, ${p.y}).`);
    }
    if (typeof p.color !== "string" || !HEX.test(p.color))
      return bad(`Invalid color for pixel (${p.x}, ${p.y}).`);
    const key = `${p.x},${p.y}`;
    if (seen.has(key)) return bad(`Duplicate pixel: (${p.x}, ${p.y}).`);
    seen.add(key);
  }

  // Reject replays: a signature can only fund one placement.
  const existing = await prisma.burnTx.findUnique({ where: { signature } });
  if (existing) return bad("This burn transaction was already used.", 409);

  // Compute bounding box of the submitted pixels.
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of pixels) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  // Enforce the per-claim size cap (200x200).
  if (maxX - minX + 1 > MAX_CLAIM_SIZE || maxY - minY + 1 > MAX_CLAIM_SIZE) {
    return bad(`Claim region exceeds ${MAX_CLAIM_SIZE}x${MAX_CLAIM_SIZE} pixels.`);
  }

  // Enforce the per-wallet lifetime ownership cap.
  const owned = await prisma.pixel.count({ where: { owner: wallet } });
  if (owned + pixels.length > MAX_PIXELS_PER_WALLET) {
    return bad(
      `This wallet can own at most ${MAX_PIXELS_PER_WALLET} pixels ` +
        `(already owns ${owned}).`,
      403,
    );
  }

  // Reject overwrites: a pixel painted by anyone is permanent (no conflicts).
  const occupied = await prisma.pixel.findMany({
    where: { x: { gte: minX, lte: maxX }, y: { gte: minY, lte: maxY } },
    select: { x: true, y: true },
  });
  const occupiedSet = new Set(occupied.map((p) => `${p.x},${p.y}`));
  for (const p of pixels) {
    if (occupiedSet.has(`${p.x},${p.y}`))
      return bad(`Pixel (${p.x}, ${p.y}) is already taken.`, 409);
  }

  // Verify the burn on-chain.
  let verified;
  try {
    verified = await verifyBurn(signature);
  } catch (e) {
    return bad(
      e instanceof Error ? e.message : "Burn verification failed.",
      422,
    );
  }

  if (verified.authority !== wallet)
    return bad("Burn was signed by a different wallet.", 403);

  const required = pixels.length * TOKENS_PER_PIXEL;
  if (verified.amount < required) {
    return bad(
      `Burn covers ${Math.floor(verified.amount / TOKENS_PER_PIXEL)} pixels but ` +
        `${pixels.length} were submitted (need ${required} tokens).`,
      402,
    );
  }

  // Persist the burn record + pixels atomically. Pixels are create-only; a
  // unique-constraint failure here means another placement won the race.
  try {
    await prisma.$transaction([
      prisma.burnTx.create({
        data: {
          signature,
          wallet,
          amount: verified.amount,
          pixelsClaimed: pixels.length,
        },
      }),
      prisma.pixel.createMany({
        data: pixels.map((p) => ({
          x: p.x,
          y: p.y,
          color: p.color,
          owner: wallet,
          txSig: signature,
        })),
      }),
    ]);
  } catch {
    return bad("Failed to save pixels (possible concurrent placement).", 409);
  }

  return NextResponse.json({ ok: true, placed: pixels.length });
}
