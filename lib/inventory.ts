import { prisma } from '@/lib/prisma'

export async function addInventoryLot({
  itemId,
  qty,
  unitType,
  expiryAt,
  sourceType,
  unitCost,
  deliveryId = null,
}: {
  itemId: string
  qty: number
  unitType: 'g' | 'ml' | 'each'
  expiryAt: Date | null
  sourceType: 'DELIVERY' | 'PREP'
  unitCost: number
  deliveryId?: string | null
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
      deliveryId,
    } as any,
  })
}

export async function getInventorySummary() {
  const lots = await prisma.inventoryLot.findMany({
    where: {
      qtyRemaining: { gt: 0 },
    },
    include: {
      item: true,
    },
    orderBy: [
      { expiryAt: 'asc' },
      { createdAt: 'asc' },
    ],
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
      stockValue: number
    }
  >()

  for (const lot of lots as any[]) {
    const existing = map.get(lot.itemId)
    const lotValue = lot.qtyRemaining * (lot.unitCost ?? 0)

    if (!existing) {
      map.set(lot.itemId, {
        itemId: lot.itemId,
        sku: lot.item.sku,
        name: lot.item.name,
        unitType: lot.unitType,
        totalQty: lot.qtyRemaining,
        nextExpiry: lot.expiryAt,
        stockValue: lotValue,
      })
    } else {
      existing.totalQty += lot.qtyRemaining
      existing.stockValue += lotValue

      if (
        lot.expiryAt &&
        (!existing.nextExpiry || lot.expiryAt < existing.nextExpiry)
      ) {
        existing.nextExpiry = lot.expiryAt
      }
    }
  }

  return Array.from(map.values())
}

export async function getInventoryLots() {
  const lots = (await prisma.inventoryLot.findMany({
    where: {
      qtyRemaining: { gt: 0 },
    },
    include: {
      item: true,
    },
    orderBy: [
      { expiryAt: 'asc' },
      { createdAt: 'desc' },
    ],
  })) as any[]

  const deliveryIds = Array.from(
    new Set(
      lots
        .map((lot) => lot.deliveryId)
        .filter((deliveryId): deliveryId is string => Boolean(deliveryId))
    )
  )

  const deliveries =
    deliveryIds.length > 0
      ? await prisma.delivery.findMany({
          where: {
            id: {
              in: deliveryIds,
            },
          },
        })
      : []

  const deliveryMap = new Map(deliveries.map((delivery) => [delivery.id, delivery]))

  return lots.map((lot) => {
    const delivery = lot.deliveryId ? deliveryMap.get(lot.deliveryId) ?? null : null

    return {
      id: lot.id,
      itemId: lot.itemId,
      sku: lot.item.sku,
      name: lot.item.name,
      unitType: lot.unitType,
      qtyInitial: lot.qtyInitial,
      qtyRemaining: lot.qtyRemaining,
      expiryAt: lot.expiryAt,
      sourceType: lot.sourceType,
      unitCost: lot.unitCost,
      createdAt: lot.createdAt,
      deliveryId: lot.deliveryId ?? null,
      delivery: delivery
        ? {
            id: delivery.id,
            deliveredAt: delivery.deliveredAt,
            supplier: delivery.supplier,
            price: delivery.price,
          }
        : null,
    }
  })
}

export async function getStockByItemId(itemId: string) {
  const result = await prisma.inventoryLot.aggregate({
    where: {
      itemId,
      qtyRemaining: { gt: 0 },
    },
    _sum: {
      qtyRemaining: true,
    },
  })

  return result._sum.qtyRemaining ?? 0
}

export async function ensureEnoughStock(itemId: string, qtyNeeded: number) {
  const stock = await getStockByItemId(itemId)
  return stock >= qtyNeeded
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

export async function consumeInventoryFifo(itemId: string, qtyNeeded: number) {
  await consumeInventory({ itemId, qtyNeeded })
}

export async function getItemById(itemId: string) {
  return prisma.item.findUnique({
    where: { id: itemId },
  })
}

export async function getItemBySku(sku: string, restaurantId?: string) {
  if (restaurantId) {
    return prisma.item.findFirst({
      where: {
        sku,
        restaurantId,
      },
    })
  }

  return prisma.item.findFirst({
    where: { sku },
  })
}