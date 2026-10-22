-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'REASSIGNED', 'UNASSIGNED');

-- CreateEnum
CREATE TYPE "CodStatus" AS ENUM ('COLLECTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "CodTransactionType" AS ENUM ('COLLECTION', 'REVERSAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "CodPaymentMethod" AS ENUM ('CASH', 'CARD', 'MOBILE_PAYMENT', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "DeliveryOutcome" AS ENUM ('DELIVERED', 'RECIPIENT_UNAVAILABLE', 'REFUSED', 'INCORRECT_ADDRESS', 'RESCHEDULED', 'RETURNED');

-- CreateEnum
CREATE TYPE "ProofOfDeliveryType" AS ENUM ('PHOTO', 'SIGNATURE', 'OTP');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "MerchantSettlement" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paidById" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "grossCod" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "deliveryFees" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "returnFees" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "adjustments" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "netPayable" SET DATA TYPE DECIMAL(12,2),
DROP COLUMN "status",
ADD COLUMN     "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "deliveryOutcome" "DeliveryOutcome";

-- CreateTable
CREATE TABLE "ShipmentAssignment" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ShipmentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodCollection" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "CodPaymentMethod" NOT NULL DEFAULT 'CASH',
    "reference" TEXT NOT NULL,
    "status" "CodStatus" NOT NULL DEFAULT 'COLLECTED',
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodTransaction" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "type" "CodTransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProofOfDelivery" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "type" "ProofOfDeliveryType" NOT NULL,
    "signatureRef" TEXT,
    "photoRef" TEXT,
    "otpCode" TEXT,
    "collectedById" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProofOfDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementItem" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "codAmount" DECIMAL(12,2) NOT NULL,
    "deliveryFee" DECIMAL(12,2) NOT NULL,
    "returnFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShipmentAssignment_shipmentId_assignedAt_idx" ON "ShipmentAssignment"("shipmentId", "assignedAt");

-- CreateIndex
CREATE INDEX "ShipmentAssignment_courierId_status_idx" ON "ShipmentAssignment"("courierId", "status");

-- CreateIndex
CREATE INDEX "ShipmentAssignment_assignedById_assignedAt_idx" ON "ShipmentAssignment"("assignedById", "assignedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CodCollection_shipmentId_key" ON "CodCollection"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CodCollection_reference_key" ON "CodCollection"("reference");

-- CreateIndex
CREATE INDEX "CodCollection_courierId_collectedAt_idx" ON "CodCollection"("courierId", "collectedAt");

-- CreateIndex
CREATE INDEX "CodCollection_status_collectedAt_idx" ON "CodCollection"("status", "collectedAt");

-- CreateIndex
CREATE INDEX "CodTransaction_collectionId_createdAt_idx" ON "CodTransaction"("collectionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProofOfDelivery_shipmentId_key" ON "ProofOfDelivery"("shipmentId");

-- CreateIndex
CREATE INDEX "SettlementItem_shipmentId_idx" ON "SettlementItem"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementItem_settlementId_shipmentId_key" ON "SettlementItem"("settlementId", "shipmentId");

-- CreateIndex
CREATE INDEX "MerchantSettlement_merchantId_status_idx" ON "MerchantSettlement"("merchantId", "status");

-- CreateIndex
CREATE INDEX "MerchantSettlement_status_createdAt_idx" ON "MerchantSettlement"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ShipmentAssignment" ADD CONSTRAINT "ShipmentAssignment_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentAssignment" ADD CONSTRAINT "ShipmentAssignment_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentAssignment" ADD CONSTRAINT "ShipmentAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodCollection" ADD CONSTRAINT "CodCollection_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodCollection" ADD CONSTRAINT "CodCollection_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodCollection" ADD CONSTRAINT "CodCollection_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodTransaction" ADD CONSTRAINT "CodTransaction_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "CodCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodTransaction" ADD CONSTRAINT "CodTransaction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofOfDelivery" ADD CONSTRAINT "ProofOfDelivery_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofOfDelivery" ADD CONSTRAINT "ProofOfDelivery_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementItem" ADD CONSTRAINT "SettlementItem_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "MerchantSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementItem" ADD CONSTRAINT "SettlementItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantSettlement" ADD CONSTRAINT "MerchantSettlement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantSettlement" ADD CONSTRAINT "MerchantSettlement_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantSettlement" ADD CONSTRAINT "MerchantSettlement_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantSettlement" ADD CONSTRAINT "MerchantSettlement_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
