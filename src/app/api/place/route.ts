import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBurn } from "@/lib/verifyBurn";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  TOKENS_PER_PIXEL,
  MAX_CLAIM_SIZE,
  COOLDOWN_MS,
  COOLDOWN_EXEMPT,
  MAX_NAME_LENGTH,
} from "@/lib/config";

type IncomingPixel = { x: number; y: number; color: string };
type Region = { x: number; y: number; w: number; h: number };

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_LINK_LENGTH = 400;

function normalizeLink(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  if (!value) return null;
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

// The burn tx memo is the source of truth:
// {"name": string, "link": string|null, "region": {x,y,w,h}}.
function parseMemo(
  memo: string | null,
): { region: Region; link: string | null; name: string } | null {
  if (!memo) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(memo);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as { name?: unknown; link?: unknown; region?: unknown };
  const r = o.region as Partial<Region> | undefined;
  if (
    !r ||
    !Number.isInteger(r.x) ||
    !Number.isInteger(r.y) ||
    !Number.isInteger(r.w) ||
    !Number.isInteger(r.h)
  ) {
    return null;
  }
  const link = normalizeLink(o.link);
  if (link === undefined) return null;
  if (typeof o.name !== "string") return null;
  const name = o.name.trim();
  if (!name || name.length > MAX_NAME_LENGTH) return null;
  return { region: { x: r.x!, y: r.y!, w: r.w!, h: r.h! }, link, name };
}

function rectsOverlap(a: Region, b: { rx: number; ry: number; rw: number; rh: number }) {
  return a.x < b.rx + b.rw && a.x + a.w > b.rx && a.y < b.ry + b.rh && a.y + a.h > b.ry;
}

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
  if (!Array.isArray(pixels)) return bad("Pixels must be an array.");

  // Replay guard.
  const existing = await prisma.burnTx.findUnique({ where: { signature } });
  if (existing) return bad("This burn transaction was already used.", 409);

  // Per-wallet cooldown (test wallets are exempt).
  if (!COOLDOWN_EXEMPT.has(wallet)) {
    const last = await prisma.burnTx.findFirst({
      where: { wallet },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (last) {
      const elapsed = Date.now() - last.createdAt.getTime();
      if (elapsed < COOLDOWN_MS) {
        const remainingSec = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
        return bad(
          `Wallet on cooldown — try again in ${Math.ceil(remainingSec / 60)} min.`,
          429,
        );
      }
    }
  }

  // Verify the burn on-chain (also returns the memo).
  let verified;
  try {
    verified = await verifyBurn(signature);
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Burn verification failed.", 422);
  }
  if (verified.authority !== wallet)
    return bad("Burn was signed by a different wallet.", 403);

  // Region + link come from the on-chain memo (source of truth).
  const meta = parseMemo(verified.memo);
  if (!meta) return bad("Burn tx is missing a valid memo (name/region/link).", 422);
  const { region, link, name } = meta;

  if (
    region.w <= 0 ||
    region.h <= 0 ||
    region.x < 0 ||
    region.y < 0 ||
    region.x + region.w > CANVAS_WIDTH ||
    region.y + region.h > CANVAS_HEIGHT
  ) {
    return bad("Memo region is invalid.", 422);
  }
  if (region.w > MAX_CLAIM_SIZE || region.h > MAX_CLAIM_SIZE)
    return bad(`Region exceeds ${MAX_CLAIM_SIZE}x${MAX_CLAIM_SIZE} pixels.`, 422);

  const area = region.w * region.h;

  // Burn must cover the whole region (area-based pricing).
  if (verified.amount < area * TOKENS_PER_PIXEL) {
    return bad(
      `Burn (${verified.amount}) does not cover the region cost (${area * TOKENS_PER_PIXEL}).`,
      402,
    );
  }

  // Validate drawn pixels are inside the region.
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
      return bad(`Pixel (${p.x}, ${p.y}) is outside the memo region.`);
    }
    if (typeof p.color !== "string" || !HEX.test(p.color))
      return bad(`Invalid color for pixel (${p.x}, ${p.y}).`);
    const key = `${p.x},${p.y}`;
    if (seen.has(key)) return bad(`Duplicate pixel: (${p.x}, ${p.y}).`);
    seen.add(key);
  }

  // No overlapping reserved regions.
  const reserved = await prisma.burnTx.findMany({
    select: { rx: true, ry: true, rw: true, rh: true },
  });
  for (const r of reserved) {
    if (rectsOverlap(region, r))
      return bad("This area overlaps a region someone already claimed.", 409);
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
          creator: name,
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

  return NextResponse.json({ ok: true, region, link, painted: pixels.length });
}
