import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/lib/config";

export const dynamic = "force-dynamic";

// Returns painted pixels (for rendering) and reserved regions (rectangles) with
// their burn tx / owner / link — used for overlap checks, tooltips and links.
export async function GET() {
  const [pixels, burns] = await Promise.all([
    prisma.pixel.findMany({ select: { x: true, y: true, color: true } }),
    prisma.burnTx.findMany({
      select: {
        signature: true,
        wallet: true,
        link: true,
        rx: true,
        ry: true,
        rw: true,
        rh: true,
      },
    }),
  ]);

  const regions = burns.map((b) => ({
    x: b.rx,
    y: b.ry,
    w: b.rw,
    h: b.rh,
    sig: b.signature,
    owner: b.wallet,
    link: b.link,
  }));

  return NextResponse.json({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    pixels,
    regions,
  });
}
