import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/lib/config";

export const dynamic = "force-dynamic";

// Returns all painted pixels (sparse). Blank pixels are simply absent.
export async function GET() {
  const pixels = await prisma.pixel.findMany({
    select: { x: true, y: true, color: true },
  });

  return NextResponse.json({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    pixels,
  });
}
