import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'
import { isSystemOwnerEmail } from '@/lib/system-owner'

const TEMPLATE_RESTAURANT_ID = 'base_template_restaurant'

type ItemCopy = {
  id: string
  sku: string
  name: string
  itemType: 'L0' | 'L1' | 'L2' | 'L3'
  unitType: 'g' | 'ml' | 'each'
  shelfLifeDays: number | null
  sellingPrice: number | null
  standardBatchOutput: number | null
  buildStatus: 'UNBUILT' | 'BUILT'
}

async function createOrReuseItem(
  targetRestaurantId: string,
  templateItem: ItemCopy,
  itemIdMap: Map<string, string>
) {
  const existing = await prisma.item.findUnique({
    where: {
      restaurantId_sku: {
        restaurantId: targetRestaurantId,
        sku: templateItem.sku,
      },
    },
  })

  if (existing) {
    itemIdMap.set(templateItem.id, existing.id)

    return existing
  }

  const created = await prisma.item.create({
    data: {
      restaurantId: targetRestaurantId,
      sku: templateItem.sku,
      name: templateItem.name,
      itemType: templateItem.itemType,
      unitType: templateItem.unitType,
      shelfLifeDays: templateItem.shelfLifeDays,
      sellingPrice: templateItem.sellingPrice,
      standardBatchOutput: templateItem.standardBatchOutput,
      buildStatus: templateItem.buildStatus,
    },
  })

  itemIdMap.set(templateItem.id, created.id)

  return created
}

async function upsertBomL0L1(data: {
  restaurantId: string
  l0ItemId: string
  l1ItemId: string
  qty: number
}) {
  const existing = await prisma.bomL0L1.findFirst({
    where: {
      restaurantId: data.restaurantId,
      l0ItemId: data.l0ItemId,
      l1ItemId: data.l1ItemId,
    },
  })

  if (existing) {
    await prisma.bomL0L1.update({
      where: { id: existing.id },
      data: { qty: data.qty },
    })

    return
  }

  await prisma.bomL0L1.create({ data })
}

async function upsertBomL1L2(data: {
  restaurantId: string
  l1ItemId: string
  l2ItemId: string
  qty: number
}) {
  const existing = await prisma.bomL1L2.findFirst({
    where: {
      restaurantId: data.restaurantId,
      l1ItemId: data.l1ItemId,
      l2ItemId: data.l2ItemId,
    },
  })

  if (existing) {
    await prisma.bomL1L2.update({
      where: { id: existing.id },
      data: { qty: data.qty },
    })

    return
  }

  await prisma.bomL1L2.create({ data })
}

async function upsertBomL1L3(data: {
  restaurantId: string
  l1ItemId: string
  l3ItemId: string
  qty: number
}) {
  const existing = await prisma.bomL1L3.findFirst({
    where: {
      restaurantId: data.restaurantId,
      l1ItemId: data.l1ItemId,
      l3ItemId: data.l3ItemId,
    },
  })

  if (existing) {
    await prisma.bomL1L3.update({
      where: { id: existing.id },
      data: { qty: data.qty },
    })

    return
  }

  await prisma.bomL1L3.create({ data })
}

async function upsertBomL2L2(data: {
  restaurantId: string
  parentL2ItemId: string
  childL2ItemId: string
  qty: number
}) {
  const existing = await prisma.bomL2L2.findFirst({
    where: {
      restaurantId: data.restaurantId,
      parentL2ItemId: data.parentL2ItemId,
      childL2ItemId: data.childL2ItemId,
    },
  })

  if (existing) {
    await prisma.bomL2L2.update({
      where: { id: existing.id },
      data: { qty: data.qty },
    })

    return
  }

  await prisma.bomL2L2.create({ data })
}

async function upsertBomL2L3(data: {
  restaurantId: string
  l2ItemId: string
  l3ItemId: string
  qty: number
}) {
  const existing = await prisma.bomL2L3.findFirst({
    where: {
      restaurantId: data.restaurantId,
      l2ItemId: data.l2ItemId,
      l3ItemId: data.l3ItemId,
    },
  })

  if (existing) {
    await prisma.bomL2L3.update({
      where: { id: existing.id },
      data: { qty: data.qty },
    })

    return
  }

  await prisma.bomL2L3.create({ data })
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!isSystemOwnerEmail(tenant.email)) {
      return NextResponse.json(
        { error: 'Only System Owners can frontload customer restaurants.' },
        { status: 403 }
      )
    }

    const body = await req.json()

    const targetRestaurantId = String(body.targetRestaurantId || '')
    const l0ItemIds = Array.isArray(body.l0ItemIds)
      ? body.l0ItemIds.map((id: unknown) => String(id)).filter(Boolean)
      : []

    if (!targetRestaurantId) {
      return NextResponse.json(
        { error: 'Missing targetRestaurantId.' },
        { status: 400 }
      )
    }

    if (l0ItemIds.length === 0) {
      return NextResponse.json(
        { error: 'Select at least one L0 menu to frontload.' },
        { status: 400 }
      )
    }

    const targetRestaurant = await prisma.restaurant.findUnique({
      where: { id: targetRestaurantId },
    })

    if (!targetRestaurant) {
      return NextResponse.json(
        { error: 'Target restaurant not found.' },
        { status: 404 }
      )
    }

    if (targetRestaurant.isTemplate) {
      return NextResponse.json(
        { error: 'Cannot frontload into the template restaurant.' },
        { status: 400 }
      )
    }

    const selectedL0Items = await prisma.item.findMany({
      where: {
        restaurantId: TEMPLATE_RESTAURANT_ID,
        itemType: 'L0',
        id: {
          in: l0ItemIds,
        },
      },
    })

    if (selectedL0Items.length !== l0ItemIds.length) {
      return NextResponse.json(
        { error: 'One or more selected L0 menus were not found in the template restaurant.' },
        { status: 400 }
      )
    }

    const bomL0L1Rows = await prisma.bomL0L1.findMany({
      where: {
        restaurantId: TEMPLATE_RESTAURANT_ID,
        l0ItemId: {
          in: l0ItemIds,
        },
      },
    })

    const neededItemIds = new Set<string>()
    const neededL1Ids = new Set<string>()
    const neededL2Ids = new Set<string>()
    const neededL3Ids = new Set<string>()

    for (const item of selectedL0Items) {
      neededItemIds.add(item.id)
    }

    for (const row of bomL0L1Rows) {
      neededItemIds.add(row.l0ItemId)
      neededItemIds.add(row.l1ItemId)
      neededL1Ids.add(row.l1ItemId)
    }

    const bomL1L2Rows = await prisma.bomL1L2.findMany({
      where: {
        restaurantId: TEMPLATE_RESTAURANT_ID,
        l1ItemId: {
          in: Array.from(neededL1Ids),
        },
      },
    })

    const bomL1L3Rows = await prisma.bomL1L3.findMany({
      where: {
        restaurantId: TEMPLATE_RESTAURANT_ID,
        l1ItemId: {
          in: Array.from(neededL1Ids),
        },
      },
    })

    for (const row of bomL1L2Rows) {
      neededItemIds.add(row.l1ItemId)
      neededItemIds.add(row.l2ItemId)
      neededL2Ids.add(row.l2ItemId)
    }

    for (const row of bomL1L3Rows) {
      neededItemIds.add(row.l1ItemId)
      neededItemIds.add(row.l3ItemId)
      neededL3Ids.add(row.l3ItemId)
    }

    const bomL2L2Rows: Awaited<ReturnType<typeof prisma.bomL2L2.findMany>> = []
    const bomL2L3Rows: Awaited<ReturnType<typeof prisma.bomL2L3.findMany>> = []

    const processedL2Ids = new Set<string>()
    let safetyCounter = 0

    while (true) {
      safetyCounter += 1

      if (safetyCounter > 250) {
        return NextResponse.json(
          { error: 'Stopped because the L2 recipe chain is too deep.' },
          { status: 400 }
        )
      }

      const nextL2Id = Array.from(neededL2Ids).find(
        (id) => !processedL2Ids.has(id)
      )

      if (!nextL2Id) break

      processedL2Ids.add(nextL2Id)

      const childL2Rows = await prisma.bomL2L2.findMany({
        where: {
          restaurantId: TEMPLATE_RESTAURANT_ID,
          parentL2ItemId: nextL2Id,
        },
      })

      const childL3Rows = await prisma.bomL2L3.findMany({
        where: {
          restaurantId: TEMPLATE_RESTAURANT_ID,
          l2ItemId: nextL2Id,
        },
      })

      bomL2L2Rows.push(...childL2Rows)
      bomL2L3Rows.push(...childL3Rows)

      for (const row of childL2Rows) {
        neededItemIds.add(row.parentL2ItemId)
        neededItemIds.add(row.childL2ItemId)
        neededL2Ids.add(row.childL2ItemId)
      }

      for (const row of childL3Rows) {
        neededItemIds.add(row.l2ItemId)
        neededItemIds.add(row.l3ItemId)
        neededL3Ids.add(row.l3ItemId)
      }
    }

    const templateItems = await prisma.item.findMany({
      where: {
        restaurantId: TEMPLATE_RESTAURANT_ID,
        id: {
          in: Array.from(neededItemIds),
        },
      },
      orderBy: {
        itemType: 'asc',
      },
    })

    const itemIdMap = new Map<string, string>()

    for (const item of templateItems as ItemCopy[]) {
      await createOrReuseItem(targetRestaurantId, item, itemIdMap)
    }

    for (const row of bomL0L1Rows) {
      const l0ItemId = itemIdMap.get(row.l0ItemId)
      const l1ItemId = itemIdMap.get(row.l1ItemId)

      if (!l0ItemId || !l1ItemId) continue

      await upsertBomL0L1({
        restaurantId: targetRestaurantId,
        l0ItemId,
        l1ItemId,
        qty: row.qty,
      })
    }

    for (const row of bomL1L2Rows) {
      const l1ItemId = itemIdMap.get(row.l1ItemId)
      const l2ItemId = itemIdMap.get(row.l2ItemId)

      if (!l1ItemId || !l2ItemId) continue

      await upsertBomL1L2({
        restaurantId: targetRestaurantId,
        l1ItemId,
        l2ItemId,
        qty: row.qty,
      })
    }

    for (const row of bomL1L3Rows) {
      const l1ItemId = itemIdMap.get(row.l1ItemId)
      const l3ItemId = itemIdMap.get(row.l3ItemId)

      if (!l1ItemId || !l3ItemId) continue

      await upsertBomL1L3({
        restaurantId: targetRestaurantId,
        l1ItemId,
        l3ItemId,
        qty: row.qty,
      })
    }

    for (const row of bomL2L2Rows) {
      const parentL2ItemId = itemIdMap.get(row.parentL2ItemId)
      const childL2ItemId = itemIdMap.get(row.childL2ItemId)

      if (!parentL2ItemId || !childL2ItemId) continue

      await upsertBomL2L2({
        restaurantId: targetRestaurantId,
        parentL2ItemId,
        childL2ItemId,
        qty: row.qty,
      })
    }

    for (const row of bomL2L3Rows) {
      const l2ItemId = itemIdMap.get(row.l2ItemId)
      const l3ItemId = itemIdMap.get(row.l3ItemId)

      if (!l2ItemId || !l3ItemId) continue

      await upsertBomL2L3({
        restaurantId: targetRestaurantId,
        l2ItemId,
        l3ItemId,
        qty: row.qty,
      })
    }

    const templateSops = await prisma.sopDocument.findMany({
      where: {
        restaurantId: TEMPLATE_RESTAURANT_ID,
        itemId: {
          in: Array.from(neededItemIds),
        },
      },
    })

    for (const sop of templateSops) {
      const targetItemId = itemIdMap.get(sop.itemId)

      if (!targetItemId) continue

      await prisma.sopDocument.upsert({
        where: {
          itemId: targetItemId,
        },
        update: {
          instructions: sop.instructions,
          restaurantId: targetRestaurantId,
        },
        create: {
          restaurantId: targetRestaurantId,
          itemId: targetItemId,
          instructions: sop.instructions,
        },
      })
    }

    const templateSupplierProducts = await prisma.supplierProduct.findMany({
      where: {
        restaurantId: TEMPLATE_RESTAURANT_ID,
        linkedItemId: {
          in: Array.from(neededItemIds),
        },
      },
    })

    let createdSupplierProducts = 0
    let updatedSupplierProducts = 0

    for (const product of templateSupplierProducts) {
      const targetLinkedItemId = product.linkedItemId
        ? itemIdMap.get(product.linkedItemId)
        : null

      let existing = null

      if (product.supplierSku) {
        existing = await prisma.supplierProduct.findFirst({
          where: {
            restaurantId: targetRestaurantId,
            supplier: product.supplier,
            supplierSku: product.supplierSku,
          },
        })
      }

      if (!existing) {
        existing = await prisma.supplierProduct.findFirst({
          where: {
            restaurantId: targetRestaurantId,
            supplier: product.supplier,
            name: product.name,
            supplierSku: product.supplierSku,
          },
        })
      }

      if (existing) {
        await prisma.supplierProduct.update({
          where: {
            id: existing.id,
          },
          data: {
            name: product.name,
            packSize: product.packSize,
            weight: product.weight,
            packPrice: product.packPrice,
            unitPrice: product.unitPrice,
            linkedItemId: targetLinkedItemId,
          },
        })

        updatedSupplierProducts += 1
      } else {
        await prisma.supplierProduct.create({
          data: {
            restaurantId: targetRestaurantId,
            supplier: product.supplier,
            supplierSku: product.supplierSku,
            name: product.name,
            packSize: product.packSize,
            weight: product.weight,
            packPrice: product.packPrice,
            unitPrice: product.unitPrice,
            linkedItemId: targetLinkedItemId,
          },
        })

        createdSupplierProducts += 1
      }
    }

    return NextResponse.json({
      ok: true,
      targetRestaurantId,
      selectedL0Count: selectedL0Items.length,
      copiedOrReusedItems: templateItems.length,
      copiedBomRows: {
        l0l1: bomL0L1Rows.length,
        l1l2: bomL1L2Rows.length,
        l1l3: bomL1L3Rows.length,
        l2l2: bomL2L2Rows.length,
        l2l3: bomL2L3Rows.length,
      },
      copiedSops: templateSops.length,
      supplierProducts: {
        created: createdSupplierProducts,
        updated: updatedSupplierProducts,
      },
    })
  } catch (error) {
    const tenantResponse = tenantErrorResponse(error)

    if (tenantResponse) {
      return tenantResponse
    }

    console.error('POST /api/admin/frontload-l0 failed:', error)

    return NextResponse.json(
      { error: 'Failed to frontload selected L0 menus.' },
      { status: 500 }
    )
  }
}