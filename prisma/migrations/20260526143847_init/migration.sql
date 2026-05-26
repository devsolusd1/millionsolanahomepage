-- CreateTable
CREATE TABLE "Pixel" (
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "txSig" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("x", "y")
);

-- CreateTable
CREATE TABLE "BurnTx" (
    "signature" TEXT NOT NULL PRIMARY KEY,
    "wallet" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "pixelsClaimed" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Pixel_owner_idx" ON "Pixel"("owner");

-- CreateIndex
CREATE INDEX "BurnTx_wallet_idx" ON "BurnTx"("wallet");
