import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

function dec(value: number | string) {
  return new Prisma.Decimal(value)
}

export async function addInventoryLot({
  itemId,
  qty,
  unitType,
  expiryAt,
  sourceType,
  unitCost,
}: {
  itemId: string
  qty: number
  unitType: 'g' | 'ml' | 'each'
  expiryAt: Date | null
  sourceType: 'DELIVERY' | 'PREP'
  unitCost: number
}) {
  return prisma.inventoryLot.create({
    data: {
      itemId,
      qtyInitial: qty,
      qtyRemaining: qty,
      unitType,
      expiryAt,
      sourceType,
      unitCost,
    },
  })
}

export async function consumeInventory({
  itemId,
  qtyNeeded,
}: {
  itemId: string
  qtyNeeded: number
}) {
  const lots = await prisma.inventoryLot.findMany({
    where: {
      itemId,
      qtyRemaining: { gt: 0 },
    },
    orderBy: [
      { expiryAt: 'asc' },
      { createdAt: 'asc' },
    ],
  })

  let remaining = qtyNeeded
  let totalCost = 0

  for (const lot of lots as any[]) {
    if (remaining <= 0) break

    const takeQty = Math.min(lot.qtyRemaining, remaining)

    totalCost += takeQty * (lot.unitCost ?? 0)

    await prisma.inventoryLot.update({
      where: { id: lot.id },
      data: {
        qtyRemaining: lot.qtyRemaining - takeQty,
      },
    })

    remaining -= takeQty
  }

  if (remaining > 0) {
    throw new Error('Not enough inventory')
  }

  return totalCost
}

export async function getItemById(itemId: string) {
  return prisma.item.findUnique({
    where: { id: itemId },
  })
}