import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/lib/config";

export const dynamic = "force-dynamic";

// Returns all painted pixels (sparse). Pixels belonging to a placement that has
// a link carry a group index `g` into the `links` array; others have g = -1.
export async function GET() {
  const pixels = await prisma.pixel.findMany({
    select: { x: true, y: true, color: true, txSig: true },
  });

  const linkedTxs = await prisma.burnTx.findMany({
    where: { link: { not: null } },
    select: { signature: true, link: true, wallet: true },
  });
  const linkBySig = new Map(
    linkedTxs.map((t) => [t.signature, { url: t.link!, owner: t.wallet }]),
  );

  const links: { url: string; owner: string }[] = [];
  const indexBySig = new Map<string, number>();

  const out = pixels.map((p) => {
    let g = -1;
    const info = linkBySig.get(p.txSig);
    if (info) {
      g = indexBySig.get(p.txSig) ?? -1;
      if (g === -1) {
        g = links.length;
        links.push(info);
        indexBySig.set(p.txSig, g);
      }
    }
    return { x: p.x, y: p.y, color: p.color, g };
  });

  return NextResponse.json({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    pixels: out,
    links,
  });
}
