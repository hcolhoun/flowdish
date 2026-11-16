import type { Prisma, PrismaClient } from '@prisma/client'

type DbClient = PrismaClient | Prisma.TransactionClient

export type ItemDeleteMode = 'recipe' | 'item_only'

type BlockingRecords = {
  deliveries: number
  inventoryLots: number
  prepBatches: number
  sales: number
  salesModifierAdjustments: number
  wastes: number
  forecastLines: number
  supplierProducts: number
}

type PlannedItem = {
  id: string
  sku: string
  name: string
  itemType: string
}

export type ItemDeletionPlan = {
  item: PlannedItem
  mode: ItemDeleteMode
  canDelete: boolean
  blockingRecords: BlockingRecords
  menuLinksRemoved: number
  directL2Count: number
  directL3Count: number
  associatedL2Count: number
  associatedL3Count: number
  deletedL2Count: number
  deletedL3Count: number
  preservedL2Count: number
  preservedL3Count: number
  deleteL2Ids: string[]
  deleteL3Ids: string[]
  preservedItems: Array<PlannedItem & { reason: string }>
}

function unique(values: string[]) {
  return Array.from(new Set(values))
}

function emptyBlockingRecords(): BlockingRecords {
  return {
    deliveries: 0,
    inventoryLots: 0,
    prepBatches: 0,
    sales: 0,
    salesModifierAdjustments: 0,
    wastes: 0,
    forecastLines: 0,
    supplierProducts: 0,
  }
}

async function itemUsage(db: DbClient, restaurantId: string, itemIds: string[]) {
  const ids = unique(itemIds)
  const reasonsById = new Map<string, Set<string>>()
  const rootCountsById = new Map<string, BlockingRecords>()

  for (const id of ids) rootCountsById.set(id, emptyBlockingRecords())

  function addUsage(
    rows: Array<{ itemId?: string; linkedItemId?: string | null }>,
    field: keyof BlockingRecords,
    reason: string
  ) {
    for (const row of rows) {
      const id = row.itemId || row.linkedItemId
      if (!id) continue
      const counts = rootCountsById.get(id)
      if (counts) counts[field]++
      const reasons = reasonsById.get(id) ?? new Set<string>()
      reasons.add(reason)
      reasonsById.set(id, reasons)
    }
  }

  if (ids.length === 0) return { reasonsById, rootCountsById }

  const [
    deliveries,
    inventoryLots,
    prepBatches,
    sales,
    salesModifierAdjustments,
    wastes,
    forecastLines,
    supplierProducts,
  ] = await Promise.all([
    db.delivery.findMany({
      where: { restaurantId, itemId: { in: ids } },
      select: { itemId: true },
    }),
    db.inventoryLot.findMany({
      where: { restaurantId, itemId: { in: ids } },
      select: { itemId: true },
    }),
    db.prepBatch.findMany({
      where: { restaurantId, itemId: { in: ids } },
      select: { itemId: true },
    }),
    db.sale.findMany({
      where: { restaurantId, itemId: { in: ids } },
      select: { itemId: true },
    }),
    db.salesModifierAdjustment.findMany({
      where: { restaurantId, itemId: { in: ids } },
      select: { itemId: true },
    }),
    db.waste.findMany({
      where: { restaurantId, itemId: { in: ids } },
      select: { itemId: true },
    }),
    db.forecastLine.findMany({
      where: { restaurantId, itemId: { in: ids } },
      select: { itemId: true },
    }),
    db.supplierProduct.findMany({
      where: { restaurantId, linkedItemId: { in: ids } },
      select: { linkedItemId: true },
    }),
  ])

  addUsage(deliveries, 'deliveries', 'delivery history')
  addUsage(inventoryLots, 'inventoryLots', 'inventory history')
  addUsage(prepBatches, 'prepBatches', 'prep history')
  addUsage(sales, 'sales', 'sales history')
  addUsage(salesModifierAdjustments, 'salesModifierAdjustments', 'sales history')
  addUsage(wastes, 'wastes', 'waste history')
  addUsage(forecastLines, 'forecastLines', 'forecast history')
  addUsage(supplierProducts, 'supplierProducts', 'supplier product link')

  return { reasonsById, rootCountsById }
}

export async function buildItemDeletionPlan(
  db: DbClient,
  restaurantId: string,
  itemId: string,
  mode: ItemDeleteMode
): Promise<ItemDeletionPlan | null> {
  const item = await db.item.findFirst({
    where: { id: itemId, restaurantId },
    select: { id: true, sku: true, name: true, itemType: true },
  })

  if (!item) return null

  const [directL2Rows, directL3Rows, menuLinksRemoved] = await Promise.all([
    db.bomL1L2.findMany({
      where: { restaurantId, l1ItemId: itemId },
      select: { l2ItemId: true },
    }),
    db.bomL1L3.findMany({
      where: { restaurantId, l1ItemId: itemId },
      select: { l3ItemId: true },
    }),
    db.bomL0L1.count({ where: { restaurantId, l1ItemId: itemId } }),
  ])

  const rootUsage = await itemUsage(db, restaurantId, [itemId])
  const blockingRecords = rootUsage.rootCountsById.get(itemId) ?? emptyBlockingRecords()
  const canDelete = Object.values(blockingRecords).every((count) => count === 0)

  if (mode === 'item_only' || item.itemType !== 'L1') {
    return {
      item,
      mode,
      canDelete,
      blockingRecords,
      menuLinksRemoved,
      directL2Count: directL2Rows.length,
      directL3Count: directL3Rows.length,
      associatedL2Count: directL2Rows.length,
      associatedL3Count: directL3Rows.length,
      deletedL2Count: 0,
      deletedL3Count: 0,
      preservedL2Count: directL2Rows.length,
      preservedL3Count: directL3Rows.length,
      deleteL2Ids: [],
      deleteL3Ids: [],
      preservedItems: [],
    }
  }

  const candidateL2 = new Set(directL2Rows.map((row) => row.l2ItemId))
  const childRows: Array<{ parentL2ItemId: string; childL2ItemId: string }> = []
  const outputRows: Array<{ parentL2ItemId: string; outputL2ItemId: string }> = []
  let frontier = Array.from(candidateL2)

  while (frontier.length > 0) {
    const [nextChildren, nextOutputs] = await Promise.all([
      db.bomL2L2.findMany({
        where: { restaurantId, parentL2ItemId: { in: frontier } },
        select: { parentL2ItemId: true, childL2ItemId: true },
      }),
      db.bomL2Output.findMany({
        where: { restaurantId, parentL2ItemId: { in: frontier } },
        select: { parentL2ItemId: true, outputL2ItemId: true },
      }),
    ])

    childRows.push(...nextChildren)
    outputRows.push(...nextOutputs)
    const discovered = unique([
      ...nextChildren.map((row) => row.childL2ItemId),
      ...nextOutputs.map((row) => row.outputL2ItemId),
    ]).filter((id) => !candidateL2.has(id))
    for (const id of discovered) candidateL2.add(id)
    frontier = discovered
  }

  const candidateL2Ids = Array.from(candidateL2)
  const [l2Items, l2Usage, externalL1Refs, externalL2Refs, externalOutputRefs] =
    candidateL2Ids.length === 0
      ? [[], await itemUsage(db, restaurantId, []), [], [], []] as const
      : await Promise.all([
          db.item.findMany({
            where: { restaurantId, id: { in: candidateL2Ids }, itemType: 'L2' },
            select: { id: true, sku: true, name: true, itemType: true },
          }),
          itemUsage(db, restaurantId, candidateL2Ids),
          db.bomL1L2.findMany({
            where: {
              restaurantId,
              l2ItemId: { in: candidateL2Ids },
              l1ItemId: { not: itemId },
            },
            select: { l2ItemId: true },
          }),
          db.bomL2L2.findMany({
            where: {
              restaurantId,
              childL2ItemId: { in: candidateL2Ids },
              parentL2ItemId: { notIn: candidateL2Ids },
            },
            select: { childL2ItemId: true },
          }),
          db.bomL2Output.findMany({
            where: {
              restaurantId,
              outputL2ItemId: { in: candidateL2Ids },
              parentL2ItemId: { notIn: candidateL2Ids },
            },
            select: { outputL2ItemId: true },
          }),
        ])

  const protectedL2 = new Set<string>()
  const l2Reasons = new Map<string, Set<string>>()

  function protectL2(id: string, reason: string) {
    protectedL2.add(id)
    const reasons = l2Reasons.get(id) ?? new Set<string>()
    reasons.add(reason)
    l2Reasons.set(id, reasons)
  }

  for (const [id, reasons] of l2Usage.reasonsById.entries()) {
    for (const reason of reasons) protectL2(id, reason)
  }
  for (const row of externalL1Refs) protectL2(row.l2ItemId, 'used by another L1 dish')
  for (const row of externalL2Refs) protectL2(row.childL2ItemId, 'used by another L2 prep item')
  for (const row of externalOutputRefs) protectL2(row.outputL2ItemId, 'output of another L2 prep item')

  let changed = true
  while (changed) {
    changed = false
    for (const row of childRows) {
      if (protectedL2.has(row.parentL2ItemId) && !protectedL2.has(row.childL2ItemId)) {
        protectL2(row.childL2ItemId, 'used by a retained L2 prep item')
        changed = true
      }
    }
    for (const row of outputRows) {
      if (protectedL2.has(row.parentL2ItemId) && !protectedL2.has(row.outputL2ItemId)) {
        protectL2(row.outputL2ItemId, 'output of a retained L2 prep item')
        changed = true
      }
    }
  }

  const deleteL2Ids = candidateL2Ids.filter((id) => !protectedL2.has(id))
  const l2IngredientRows =
    candidateL2Ids.length > 0
      ? await db.bomL2L3.findMany({
          where: { restaurantId, l2ItemId: { in: candidateL2Ids } },
          select: { l2ItemId: true, l3ItemId: true },
        })
      : []
  const candidateL3Ids = unique([
    ...directL3Rows.map((row) => row.l3ItemId),
    ...l2IngredientRows.map((row) => row.l3ItemId),
  ])
  const [l3Items, l3Usage, externalL1IngredientRefs, retainedL2IngredientRefs] =
    candidateL3Ids.length === 0
      ? [[], await itemUsage(db, restaurantId, []), [], []] as const
      : await Promise.all([
          db.item.findMany({
            where: { restaurantId, id: { in: candidateL3Ids }, itemType: 'L3' },
            select: { id: true, sku: true, name: true, itemType: true },
          }),
          itemUsage(db, restaurantId, candidateL3Ids),
          db.bomL1L3.findMany({
            where: {
              restaurantId,
              l3ItemId: { in: candidateL3Ids },
              l1ItemId: { not: itemId },
            },
            select: { l3ItemId: true },
          }),
          db.bomL2L3.findMany({
            where: {
              restaurantId,
              l3ItemId: { in: candidateL3Ids },
              l2ItemId: { notIn: deleteL2Ids },
            },
            select: { l3ItemId: true },
          }),
        ])

  const protectedL3 = new Set<string>()
  const l3Reasons = new Map<string, Set<string>>()

  function protectL3(id: string, reason: string) {
    protectedL3.add(id)
    const reasons = l3Reasons.get(id) ?? new Set<string>()
    reasons.add(reason)
    l3Reasons.set(id, reasons)
  }

  for (const [id, reasons] of l3Usage.reasonsById.entries()) {
    for (const reason of reasons) protectL3(id, reason)
  }
  for (const row of externalL1IngredientRefs) protectL3(row.l3ItemId, 'used by another L1 dish')
  for (const row of retainedL2IngredientRefs) protectL3(row.l3ItemId, 'used by a retained L2 prep item')

  const deleteL3Ids = candidateL3Ids.filter((id) => !protectedL3.has(id))
  const preservedItems = [
    ...l2Items
      .filter((candidate) => protectedL2.has(candidate.id))
      .map((candidate) => ({
        ...candidate,
        reason: Array.from(l2Reasons.get(candidate.id) ?? ['shared item']).join(', '),
      })),
    ...l3Items
      .filter((candidate) => protectedL3.has(candidate.id))
      .map((candidate) => ({
        ...candidate,
        reason: Array.from(l3Reasons.get(candidate.id) ?? ['shared item']).join(', '),
      })),
  ]

  return {
    item,
    mode,
    canDelete,
    blockingRecords,
    menuLinksRemoved,
    directL2Count: directL2Rows.length,
    directL3Count: directL3Rows.length,
    associatedL2Count: candidateL2Ids.length,
    associatedL3Count: candidateL3Ids.length,
    deletedL2Count: deleteL2Ids.length,
    deletedL3Count: deleteL3Ids.length,
    preservedL2Count: candidateL2Ids.length - deleteL2Ids.length,
    preservedL3Count: candidateL3Ids.length - deleteL3Ids.length,
    deleteL2Ids,
    deleteL3Ids,
    preservedItems,
  }
}

export async function executeItemDeletion(db: DbClient, plan: ItemDeletionPlan) {
  const restaurantId = plan.item.id ? undefined : undefined
  void restaurantId
  const rootId = plan.item.id
  const itemIdsToDelete = [...plan.deleteL2Ids, ...plan.deleteL3Ids]

  await db.bomL0L1.deleteMany({ where: { l1ItemId: rootId } })
  await db.bomL1L2.deleteMany({
    where: {
      OR: [
        { l1ItemId: rootId },
        ...(plan.deleteL2Ids.length > 0 ? [{ l2ItemId: { in: plan.deleteL2Ids } }] : []),
      ],
    },
  })
  await db.bomL1L3.deleteMany({
    where: {
      OR: [
        { l1ItemId: rootId },
        ...(plan.deleteL3Ids.length > 0 ? [{ l3ItemId: { in: plan.deleteL3Ids } }] : []),
      ],
    },
  })

  if (plan.deleteL2Ids.length > 0) {
    await db.bomL2L2.deleteMany({
      where: {
        OR: [
          { parentL2ItemId: { in: plan.deleteL2Ids } },
          { childL2ItemId: { in: plan.deleteL2Ids } },
        ],
      },
    })
    await db.bomL2Output.deleteMany({
      where: {
        OR: [
          { parentL2ItemId: { in: plan.deleteL2Ids } },
          { outputL2ItemId: { in: plan.deleteL2Ids } },
        ],
      },
    })
  }

  if (plan.deleteL2Ids.length > 0 || plan.deleteL3Ids.length > 0) {
    await db.bomL2L3.deleteMany({
      where: {
        OR: [
          ...(plan.deleteL2Ids.length > 0 ? [{ l2ItemId: { in: plan.deleteL2Ids } }] : []),
          ...(plan.deleteL3Ids.length > 0 ? [{ l3ItemId: { in: plan.deleteL3Ids } }] : []),
        ],
      },
    })
  }

  await db.sopDocument.deleteMany({
    where: { itemId: { in: [rootId, ...itemIdsToDelete] } },
  })

  if (itemIdsToDelete.length > 0) {
    await db.item.deleteMany({ where: { id: { in: itemIdsToDelete } } })
  }
  await db.item.delete({ where: { id: rootId } })
}
