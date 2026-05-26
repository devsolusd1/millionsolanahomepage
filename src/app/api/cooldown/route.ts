import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { COOLDOWN_MS, COOLDOWN_EXEMPT } from "@/lib/config";

export const dynamic = "force-dynamic";

// Returns how long (ms) a wallet must wait before it can place again.
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet || COOLDOWN_EXEMPT.has(wallet))
    return NextResponse.json({ remainingMs: 0 });

  const last = await prisma.burnTx.findFirst({
    where: { wallet },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  let remainingMs = 0;
  if (last) {
    const elapsed = Date.now() - last.createdAt.getTime();
    remainingMs = Math.max(0, COOLDOWN_MS - elapsed);
  }
  return NextResponse.json({ remainingMs });
}
