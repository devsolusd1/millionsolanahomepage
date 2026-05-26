import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/lib/config";

export const dynamic = "force-dynamic";

// Returns all painted pixels (sparse). Each pixel carries a group index `g`
// into `placements`, which holds the burn tx, owner and optional link for the
// placement that created it — so the UI can prove each pixel was burned on-chain.
export async function GET() {
  const pixels = await prisma.pixel.findMany({
    select: { x: true, y: true, color: true, txSig: true },
  });

  const burns = await prisma.burnTx.findMany({
    select: { signature: true, wallet: true, link: true },
  });
  const burnBySig = new Map(
    burns.map((b) => [b.signature, { owner: b.wallet, link: b.link }]),
  );

  const placements: { sig: string; owner: string; link: string | null }[] = [];
  const indexBySig = new Map<string, number>();

  const out = pixels.map((p) => {
    let g = indexBySig.get(p.txSig);
    if (g === undefined) {
      const info = burnBySig.get(p.txSig);
      g = placements.length;
      placements.push({
        sig: p.txSig,
        owner: info?.owner ?? "",
        link: info?.link ?? null,
      });
      indexBySig.set(p.txSig, g);
    }
    return { x: p.x, y: p.y, color: p.color, g };
  });

  return NextResponse.json({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    pixels: out,
    placements,
  });
}
