import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBurn } from "@/lib/verifyBurn";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  TOKENS_PER_PIXEL,
  MAX_CLAIM_SIZE,
} from "@/lib/config";

type IncomingPixel = { x: number; y: number; color: string };
type Region = { x: number; y: number; w: number; h: number };

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_LINK_LENGTH = 400;

// Only allow http/https links (never javascript:, data:, etc).
function normalizeLink(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") return undefined; // invalid
  const value = raw.trim();
  if (value.length > MAX_LINK_LENGTH) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  return url.toString();
}

// Axis-aligned rectangle overlap test (regions are reserved exclusively).
function rectsOverlap(a: Region, b: { rx: number; ry: number; rw: number; rh: number }) {
  return (
    a.x < b.rx + b.rw &&
    a.x + a.w > b.rx &&
    a.y < b.ry + b.rh &&
    a.y + a.h > b.ry
  );
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  let body: {
    signature?: string;
    wallet?: string;
    region?: Region;
    pixels?: IncomingPixel[];
    link?: string;
  };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body.");
  }

  const { signature, wallet, region, pixels } = body;

  if (typeof signature !== "string" || !signature)
    return bad("Missing burn transaction signature.");
  if (typeof wallet !== "string" || !wallet) return bad("Missing wallet.");

  // Validate the reserved region.
  if (
    !region ||
    !Number.isInteger(region.x) ||
    !Number.isInteger(region.y) ||
    !Number.isInteger(region.w) ||
    !Number.isInteger(region.h) ||
    region.w <= 0 ||
    region.h <= 0 ||
    region.x < 0 ||
    region.y < 0 ||
    region.x + region.w > CANVAS_WIDTH ||
    region.y + region.h > CANVAS_HEIGHT
  ) {
    return bad("Invalid region.");
  }
  if (region.w > MAX_CLAIM_SIZE || region.h > MAX_CLAIM_SIZE)
    return bad(`Region exceeds ${MAX_CLAIM_SIZE}x${MAX_CLAIM_SIZE} pixels.`);

  const area = region.w * region.h;

  const link = normalizeLink(body.link);
  if (link === undefined)
    return bad("Invalid link — must be a valid http(s) URL.");

  // Validate the drawn pixels (a subset of the region).
  if (!Array.isArray(pixels)) return bad("Pixels must be an array.");
  if (pixels.length > area) return bad("More pixels than the region holds.");
  const seen = new Set<string>();
  for (const p of pixels) {
    if (
      !Number.isInteger(p.x) ||
      !Number.isInteger(p.y) ||
      p.x < region.x ||
      p.y < region.y ||
      p.x >= region.x + region.w ||
      p.y >= region.y + region.h
    ) {
      return bad(`Pixel (${p.x}, ${p.y}) is outside the region.`);
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

  // Reject regions overlapping any already-reserved region.
  const reserved = await prisma.burnTx.findMany({
    select: { rx: true, ry: true, rw: true, rh: true },
  });
  for (const r of reserved) {
    if (rectsOverlap(region, r))
      return bad("This area overlaps a region someone already claimed.", 409);
  }

  // Verify the burn on-chain.
  let verified;
  try {
    verified = await verifyBurn(signature);
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Burn verification failed.", 422);
  }

  if (verified.authority !== wallet)
    return bad("Burn was signed by a different wallet.", 403);

  // Burn must cover the whole selected area (not just the drawn pixels).
  const required = area * TOKENS_PER_PIXEL;
  if (verified.amount < required) {
    return bad(
      `Burn covers ${Math.floor(verified.amount / TOKENS_PER_PIXEL)} pixels but ` +
        `the region is ${area} (need ${required} tokens).`,
      402,
    );
  }

  try {
    await prisma.$transaction([
      prisma.burnTx.create({
        data: {
          signature,
          wallet,
          amount: verified.amount,
          rx: region.x,
          ry: region.y,
          rw: region.w,
          rh: region.h,
          pixelsClaimed: area,
          link,
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
    return bad("Failed to save placement (possible concurrent claim).", 409);
  }

  return NextResponse.json({ ok: true, region, painted: pixels.length });
}
