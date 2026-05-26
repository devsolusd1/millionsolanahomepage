// Wipes ALL pixels and burn records from the database.
// Use to clear test data before going to a fresh (e.g. mainnet) deployment.
//
// Run with: npm run reset-canvas

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const beforePixels = await prisma.pixel.count();
  const beforeBurns = await prisma.burnTx.count();
  console.log(`Before: ${beforePixels} pixels, ${beforeBurns} burns.`);

  // Pixels reference burns logically; delete pixels first.
  await prisma.pixel.deleteMany({});
  await prisma.burnTx.deleteMany({});

  const afterPixels = await prisma.pixel.count();
  const afterBurns = await prisma.burnTx.count();
  console.log(`After:  ${afterPixels} pixels, ${afterBurns} burns.`);
  console.log("Canvas wiped clean.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
