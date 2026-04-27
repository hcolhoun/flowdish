import { prisma } from '@/lib/prisma'
import { InventorySourceType, Prisma, UnitType } from '@prisma/client'

function dec(value: number | string) {
  return new Prisma.Decimal(value)
}

export async function addInventoryLot(params: {
  itemId: string
  qty: number
  unitType: UnitType
  expiryAt?: Date | null
  sourceType: InventorySourceType
}) {
  return prisma.inventoryLot.create({
    data: {
      itemId: params.itemId,
      qtyInitial: params.qty,
      qtyRemaining: params.qty,
      unitType: params.unitType,
      expiryAt: params.expiryAt ?? null,
      sourceType: params.sourceType,
    },
  })
}

export async function getInventorySummary() {
  const lots = await prisma.inventoryLot.findMany({
    include: { item: true },
    orderBy: [{ itemId: 'asc' }, { expiryAt: 'asc' }],
  })

  const map = new Map<
    string,
    {
      itemId: string
      sku: string
      name: string
      unitType: string
      totalQty: number
      nextExpiry: Date | null
    }
  >()

  for (const lot of lots) {
    const key = lot.itemId
    const existing = map.get(key)

    if (!existing) {
      map.set(key, {
        itemId: lot.itemId,
        sku: lot.item.sku,
        name: lot.item.name,
        unitType: lot.unitType,
        totalQty: lot.qtyRemaining,
        nextExpiry: lot.expiryAt,
      })
      continue
    }

    existing.totalQty += lot.qtyRemaining

    if (
      lot.expiryAt &&
      (!existing.nextExpiry || lot.expiryAt < existing.nextExpiry)
    ) {
      existing.nextExpiry = lot.expiryAt
    }
  }

  return Array.from(map.values())
}

export async function getStockByItemId(itemId: string) {
  const result = await prisma.inventoryLot.aggregate({
    where: { itemId },
    _sum: { qtyRemaining: true },
  })

  return result._sum.qtyRemaining ?? 0
}

export async function ensureEnoughStock(itemId: string, qtyNeeded: number) {
  const stock = await getStockByItemId(itemId)
  return stock >= qtyNeeded
}

export async function consumeInventoryFifo(itemId: string, qtyNeeded: number) {
  let remaining = qtyNeeded

  const lots = await prisma.inventoryLot.findMany({
    where: {
      itemId,
      qtyRemaining: { gt: 0 },
    },
    orderBy: [
      { expiryAt: 'asc' },
      { id: 'asc' },
    ],
  })

  const total = lots.reduce((sum, lot) => sum + lot.qtyRemaining, 0)

  if (total < qtyNeeded) {
    throw new Error('Insufficient stock')
  }

  for (const lot of lots) {
    if (remaining <= 0) break

    const take = Math.min(lot.qtyRemaining, remaining)

    await prisma.inventoryLot.update({
      where: { id: lot.id },
      data: {
        qtyRemaining: lot.qtyRemaining - take,
      },
    })

    remaining -= take
  }
}

export async function getItemById(itemId: string) {
  return prisma.item.findUnique({
    where: { id: itemId },
  })
}

export async function getItemBySku(sku: string) {
  return prisma.item.findUnique({
    where: { sku },
  })
}