import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Lists every placement (burn) newest-first, with its pixels (for a thumbnail)
// and the burn tx, so the gallery can show past drawings and their on-chain tx.
export async function GET() {
  const [burns, pixels] = await Promise.all([
    prisma.burnTx.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.pixel.findMany({ select: { x: true, y: true, color: true, txSig: true } }),
  ]);

  const bySig = new Map<string, { x: number; y: number; color: string }[]>();
  for (const p of pixels) {
    const arr = bySig.get(p.txSig);
    if (arr) arr.push({ x: p.x, y: p.y, color: p.color });
    else bySig.set(p.txSig, [{ x: p.x, y: p.y, color: p.color }]);
  }

  const placements = burns.map((b) => {
    const px = bySig.get(b.signature) ?? [];
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of px) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      sig: b.signature,
      owner: b.wallet,
      pixelsClaimed: b.pixelsClaimed,
      link: b.link,
      createdAt: b.createdAt,
      bbox: px.length ? { minX, minY, maxX, maxY } : null,
      pixels: px,
    };
  });

  return NextResponse.json({ placements });
}
