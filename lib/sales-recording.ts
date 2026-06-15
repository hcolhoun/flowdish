import { prisma } from '@/lib/prisma'

export async function consumeInventoryForItem({
  tx,
  restaurantId,
  itemId,
  qty,
}: {
  tx: any
  restaurantId: string
  itemId: string
  qty: number
}) {
  let totalCost = 0
  let qtyNeeded = qty

  const lots = await tx.inventoryLot.findMany({
    where: {
      restaurantId,
      itemId,
      qtyRemaining: { gt: 0 },
    },
    orderBy: [{ expiryAt: 'asc' }, { createdAt: 'asc' }],
  })

  for (const lot of lots) {
    if (qtyNeeded <= 0) break

    const takeQty = Math.min(lot.qtyRemaining, qtyNeeded)
    totalCost += takeQty * (lot.unitCost ?? 0)

    await tx.inventoryLot.update({
      where: { id: lot.id },
      data: {
        qtyRemaining: lot.qtyRemaining - takeQty,
      },
    })

    qtyNeeded -= takeQty
  }

  if (qtyNeeded > 0) {
    throw new Error('NOT_ENOUGH_STOCK')
  }

  return totalCost
}

export async function returnInventoryForItem({
  tx,
  restaurantId,
  itemId,
  qty,
}: {
  tx: any
  restaurantId: string
  itemId: string
  qty: number
}) {
  const item = await tx.item.findFirst({
    where: {
      id: itemId,
      restaurantId,
    },
  })

  if (!item) throw new Error('ITEM_NOT_FOUND')

  return tx.inventoryLot.create({
    data: {
      restaurantId,
      itemId,
      qtyInitial: qty,
      qtyRemaining: qty,
      unitType: item.unitType,
      sourceType: 'PREP',
      unitCost: 0,
    },
  })
}

export async function calculateAndConsumeL1Sale({
  tx,
  restaurantId,
  l1ItemId,
  qtySold,
}: {
  tx: any
  restaurantId: string
  l1ItemId: string
  qtySold: number
}) {
  let totalCost = 0

  const [l1ToL2Rows, l1ToL3Rows] = await Promise.all([
    tx.bomL1L2.findMany({
      where: {
        restaurantId,
        l1ItemId,
      },
      include: {
        l2: true,
      },
    }),
    tx.bomL1L3.findMany({
      where: {
        restaurantId,
        l1ItemId,
      },
      include: {
        l3: true,
      },
    }),
  ])

  if (l1ToL2Rows.length === 0 && l1ToL3Rows.length === 0) {
    throw new Error('NO_BOM')
  }

  for (const row of l1ToL2Rows) {
    totalCost += await consumeInventoryForItem({
      tx,
      restaurantId,
      itemId: row.l2ItemId,
      qty: row.qty * qtySold,
    })
  }

  for (const row of l1ToL3Rows) {
    totalCost += await consumeInventoryForItem({
      tx,
      restaurantId,
      itemId: row.l3ItemId,
      qty: row.qty * qtySold,
    })
  }

  return totalCost
}

export async function recordL1Sale({
  tx,
  restaurantId,
  itemId,
  soldAt,
  qty,
}: {
  tx: any
  restaurantId: string
  itemId: string
  soldAt: Date
  qty: number
}) {
  const item = await tx.item.findFirst({
    where: {
      id: itemId,
      restaurantId,
    },
  })

  if (!item) throw new Error('ITEM_NOT_FOUND')
  if (item.itemType !== 'L1') throw new Error('NOT_L1')

  const totalCost = await calculateAndConsumeL1Sale({
    tx,
    restaurantId,
    l1ItemId: item.id,
    qtySold: qty,
  })

  return tx.sale.create({
    data: {
      restaurantId,
      soldAt,
      itemId: item.id,
      qty,
      cost: totalCost,
    },
    include: {
      item: true,
    },
  })
}

export async function recordSingleL1Sale(input: {
  restaurantId: string
  itemId: string
  soldAt: Date
  qty: number
}) {
  return prisma.$transaction((tx: any) => recordL1Sale({ tx, ...input }))
}
