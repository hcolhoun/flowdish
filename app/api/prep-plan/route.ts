import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'

type StockPosition = {
  totalStock: number
  usableStock: number
  expiringBeforeForecastEnd: number
  expiredStock: number
  nextExpiry: Date | null
  daysToNextExpiry: number | null
}

type IngredientRequirement = {
  itemId: string
  sku: string
  name: string
  unitType: 'g' | 'ml' | 'each'
  requiredQty: number
  usableStock: number
  shortfallQty: number
  supplier: string | null
  supplierSku: string | null
}

function daysBetween(from: Date, to: Date) {
  const ms = to.getTime() - from.getTime()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

function addToMap(map: Map<string, number>, itemId: string, qty: number) {
  map.set(itemId, (map.get(itemId) ?? 0) + qty)
}

function makeableFrom(stock: number, qtyPerUnit: number) {
  if (!qtyPerUnit || qtyPerUnit <= 0) return 0
  return Math.floor(stock / qtyPerUnit)
}

async function getStockPosition({
  restaurantId,
  itemId,
  forecastEndDate,
}: {
  restaurantId: string
  itemId: string
  forecastEndDate: Date
}): Promise<StockPosition> {
  const now = new Date()

  const lots = await prisma.inventoryLot.findMany({
    where: {
      restaurantId,
      itemId,
      qtyRemaining: { gt: 0 },
    },
    orderBy: [
      { expiryAt: 'asc' },
      { createdAt: 'asc' },
    ],
  })

  let totalStock = 0
  let usableStock = 0
  let expiringBeforeForecastEnd = 0
  let expiredStock = 0
  let nextExpiry: Date | null = null

  for (const lot of lots as any[]) {
    totalStock += lot.qtyRemaining

    if (lot.expiryAt && !nextExpiry) {
      nextExpiry = lot.expiryAt
    }

    if (lot.expiryAt && lot.expiryAt < now) {
      expiredStock += lot.qtyRemaining
      continue
    }

    const expiryWarningDate = lot.expiryAt
      ? new Date(lot.expiryAt.getTime() + 24 * 60 * 60 * 1000)
      : null

    if (expiryWarningDate && expiryWarningDate <= forecastEndDate) {
      expiringBeforeForecastEnd += lot.qtyRemaining
      continue
    }

    usableStock += lot.qtyRemaining
  }

  return {
    totalStock,
    usableStock,
    expiringBeforeForecastEnd,
    expiredStock,
    nextExpiry,
    daysToNextExpiry: nextExpiry ? daysBetween(now, nextExpiry) : null,
  }
}

async function addL3RequirementsForL2Output({
  restaurantId,
  l2ItemId,
  outputQty,
  l3RequiredMap,
  stack = new Set<string>(),
}: {
  restaurantId: string
  l2ItemId: string
  outputQty: number
  l3RequiredMap: Map<string, number>
  stack?: Set<string>
}) {
  if (outputQty <= 0) return
  if (stack.has(l2ItemId)) return

  const nextStack = new Set(stack)
  nextStack.add(l2ItemId)

  const l2Item = await prisma.item.findFirst({
    where: {
      id: l2ItemId,
      restaurantId,
    },
  })

  if (!l2Item || l2Item.itemType !== 'L2') return
  if (!l2Item.standardBatchOutput || l2Item.standardBatchOutput <= 0) return

  const scaleFactor = outputQty / l2Item.standardBatchOutput

  const [childL2Rows, l3Rows] = await Promise.all([
    prisma.bomL2L2.findMany({
      where: {
        restaurantId,
        parentL2ItemId: l2ItemId,
      },
    }),

    prisma.bomL2L3.findMany({
      where: {
        restaurantId,
        l2ItemId,
      },
    }),
  ])

  for (const row of l3Rows as any[]) {
    addToMap(l3RequiredMap, row.l3ItemId, row.qty * scaleFactor)
  }

  for (const row of childL2Rows as any[]) {
    const childOutputRequired = row.qty * scaleFactor

    const childStock = await getStockPosition({
      restaurantId,
      itemId: row.childL2ItemId,
      forecastEndDate: new Date('2999-12-31'),
    })

    const childShortfall = Math.max(0, childOutputRequired - childStock.usableStock)

    if (childShortfall > 0) {
      await addL3RequirementsForL2Output({
        restaurantId,
        l2ItemId: row.childL2ItemId,
        outputQty: childShortfall,
        l3RequiredMap,
        stack: nextStack,
      })
    }
  }
}

async function buildIngredientAvailability({
  restaurantId,
  forecastEndDate,
  l2ItemId,
  prepOutputQty,
}: {
  restaurantId: string
  forecastEndDate: Date
  l2ItemId: string
  prepOutputQty: number
}) {
  const l3RequiredMap = new Map<string, number>()

  await addL3RequirementsForL2Output({
    restaurantId,
    l2ItemId,
    outputQty: prepOutputQty,
    l3RequiredMap,
  })

  const rows: IngredientRequirement[] = []

  for (const [l3ItemId, requiredQty] of l3RequiredMap.entries()) {
    const item = await prisma.item.findFirst({
      where: {
        id: l3ItemId,
        restaurantId,
      },
    })

    if (!item) continue

    const stock = await getStockPosition({
      restaurantId,
      itemId: l3ItemId,
      forecastEndDate,
    })

    const supplierProduct = await prisma.supplierProduct.findFirst({
      where: {
        restaurantId,
        linkedItemId: l3ItemId,
      },
      orderBy: [
        { createdAt: 'desc' },
      ],
    })

    rows.push({
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      unitType: item.unitType as 'g' | 'ml' | 'each',
      requiredQty,
      usableStock: stock.usableStock,
      shortfallQty: Math.max(0, requiredQty - stock.usableStock),
      supplier: supplierProduct?.supplier ?? null,
      supplierSku: supplierProduct?.supplierSku ?? null,
    })
  }

  rows.sort((a, b) => {
    if (a.shortfallQty > 0 && b.shortfallQty <= 0) return -1
    if (a.shortfallQty <= 0 && b.shortfallQty > 0) return 1
    return a.name.localeCompare(b.name)
  })

  return rows
}

export async function GET(req: Request) {
  try {
    const tenant = await requireTenant()

    const { searchParams } = new URL(req.url)
    const forecastId = searchParams.get('forecastId')

    if (!forecastId) {
      return NextResponse.json({ error: 'Missing forecastId' }, { status: 400 })
    }

    const forecast = await prisma.forecast.findFirst({
      where: {
        id: forecastId,
        restaurantId: tenant.restaurantId,
      },
      include: {
        lines: {
          include: { item: true },
        },
      },
    })

    if (!forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    const forecastEndDate = forecast.endDate

    const l1Plan: any[] = []
    const l2RequiredMap = new Map<string, number>()

    for (const line of forecast.lines as any[]) {
      const l1Item = line.item

      if (l1Item.itemType !== 'L1') continue

      const bomL1L2 = await prisma.bomL1L2.findMany({
        where: {
          restaurantId: tenant.restaurantId,
          l1ItemId: l1Item.id,
        },
        include: { l2: true },
      })

      const bomL1L3 = await prisma.bomL1L3.findMany({
        where: {
          restaurantId: tenant.restaurantId,
          l1ItemId: l1Item.id,
        },
        include: { l3: true },
      })

      let makeableQty = Number.POSITIVE_INFINITY

      for (const row of bomL1L2 as any[]) {
        const stock = await getStockPosition({
          restaurantId: tenant.restaurantId,
          itemId: row.l2ItemId,
          forecastEndDate,
        })

        makeableQty = Math.min(makeableQty, makeableFrom(stock.usableStock, row.qty))
      }

      for (const row of bomL1L3 as any[]) {
        const stock = await getStockPosition({
          restaurantId: tenant.restaurantId,
          itemId: row.l3ItemId,
          forecastEndDate,
        })

        makeableQty = Math.min(makeableQty, makeableFrom(stock.usableStock, row.qty))
      }

      if (!Number.isFinite(makeableQty)) {
        makeableQty = 0
      }

      const forecastQty = line.qty
      const shortfallQty = Math.max(0, forecastQty - makeableQty)

      l1Plan.push({
        itemId: l1Item.id,
        sku: l1Item.sku,
        name: l1Item.name,
        forecastQty,
        makeableQty,
        shortfallQty,
      })

      if (shortfallQty > 0) {
        for (const row of bomL1L2 as any[]) {
          const requiredQty = row.qty * shortfallQty
          addToMap(l2RequiredMap, row.l2ItemId, requiredQty)
        }
      }
    }

    const processedL2Ids = new Set<string>()
    let safetyCounter = 0

    while (true) {
      safetyCounter += 1

      if (safetyCounter > 200) {
        throw new Error('Nested L2 planning stopped because a recipe chain is too deep.')
      }

      const nextL2Id = Array.from(l2RequiredMap.keys()).find(
        (id) => !processedL2Ids.has(id)
      )

      if (!nextL2Id) break

      processedL2Ids.add(nextL2Id)

      const item = await prisma.item.findFirst({
        where: {
          id: nextL2Id,
          restaurantId: tenant.restaurantId,
        },
      })

      if (!item || item.itemType !== 'L2') continue

      const requiredQty = l2RequiredMap.get(nextL2Id) ?? 0

      const stock = await getStockPosition({
        restaurantId: tenant.restaurantId,
        itemId: nextL2Id,
        forecastEndDate,
      })

      const shortfallQty = Math.max(0, requiredQty - stock.usableStock)

      if (shortfallQty <= 0) continue
      if (!item.standardBatchOutput || item.standardBatchOutput <= 0) continue

      const scaleFactor = shortfallQty / item.standardBatchOutput

      const childL2Rows = await prisma.bomL2L2.findMany({
        where: {
          restaurantId: tenant.restaurantId,
          parentL2ItemId: nextL2Id,
        },
      })

      for (const row of childL2Rows as any[]) {
        const childRequiredQty = row.qty * scaleFactor
        addToMap(l2RequiredMap, row.childL2ItemId, childRequiredQty)
      }
    }

    const l2Plan: any[] = []

    for (const [l2ItemId, requiredQty] of l2RequiredMap.entries()) {
      const item = await prisma.item.findFirst({
        where: {
          id: l2ItemId,
          restaurantId: tenant.restaurantId,
        },
      })

      if (!item) continue

      const stock = await getStockPosition({
        restaurantId: tenant.restaurantId,
        itemId: l2ItemId,
        forecastEndDate,
      })

      const shortfallQty = Math.max(0, requiredQty - stock.usableStock)
      const standardBatchOutput = item.standardBatchOutput ?? null

      const batchesToPrep =
        standardBatchOutput && standardBatchOutput > 0
          ? Math.ceil(shortfallQty / standardBatchOutput)
          : 0

      const prepOutputQty =
        standardBatchOutput && standardBatchOutput > 0
          ? batchesToPrep * standardBatchOutput
          : shortfallQty

      const ingredientAvailability =
        shortfallQty > 0 && prepOutputQty > 0
          ? await buildIngredientAvailability({
              restaurantId: tenant.restaurantId,
              forecastEndDate,
              l2ItemId,
              prepOutputQty,
            })
          : []

      const missingIngredientCount = ingredientAvailability.filter(
        (row) => row.shortfallQty > 0
      ).length

      let expiryStatus = 'OK'

      if (shortfallQty > 0 && missingIngredientCount > 0) {
        expiryStatus = 'MISSING INGREDIENTS'
      } else if (shortfallQty > 0) {
        expiryStatus = 'PREP REQUIRED'
      } else if (stock.expiredStock > 0) {
        expiryStatus = 'EXPIRED STOCK'
      } else if (stock.expiringBeforeForecastEnd > 0) {
        expiryStatus = 'EXPIRING BEFORE FORECAST ENDS'
      } else if (stock.daysToNextExpiry !== null && stock.daysToNextExpiry <= 2) {
        expiryStatus = 'USE SOON'
      }

      l2Plan.push({
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        unitType: item.unitType,
        requiredQty,
        totalStock: stock.totalStock,
        usableStock: stock.usableStock,
        expiringBeforeForecastEnd: stock.expiringBeforeForecastEnd,
        expiredStock: stock.expiredStock,
        shortfallQty,
        standardBatchOutput,
        batchesToPrep,
        prepOutputQty,
        shelfLifeDays: item.shelfLifeDays ?? null,
        nextExpiry: stock.nextExpiry,
        daysToNextExpiry: stock.daysToNextExpiry,
        expiryStatus,
        canPrepNow: shortfallQty > 0 && missingIngredientCount === 0,
        missingIngredientCount,
        ingredientAvailability,
        prepHandsOnMinutesPerBatch: item.prepHandsOnMinutes,
        prepElapsedMinutesPerBatch: item.prepElapsedMinutes,
        prepTimeStatus: item.prepTimeStatus,
        totalPrepHandsOnMinutes:
          item.prepTimeStatus === 'CONFIRMED' && item.prepHandsOnMinutes !== null
            ? batchesToPrep * item.prepHandsOnMinutes
            : null,
        totalPrepElapsedMinutes:
          item.prepTimeStatus === 'CONFIRMED' && item.prepElapsedMinutes !== null
            ? batchesToPrep * item.prepElapsedMinutes
            : null,
      })
    }

    l2Plan.sort((a, b) => {
      if (a.missingIngredientCount > 0 && b.missingIngredientCount <= 0) return -1
      if (a.missingIngredientCount <= 0 && b.missingIngredientCount > 0) return 1
      if (a.shortfallQty > 0 && b.shortfallQty <= 0) return -1
      if (a.shortfallQty <= 0 && b.shortfallQty > 0) return 1
      return a.name.localeCompare(b.name)
    })

    const prepLabourSummary = {
      totalHandsOnMinutes: l2Plan.reduce(
        (sum, row) => sum + (row.totalPrepHandsOnMinutes ?? 0),
        0
      ),
      totalElapsedMinutes: l2Plan.reduce(
        (sum, row) => sum + (row.totalPrepElapsedMinutes ?? 0),
        0
      ),
      missingPrepTimeCount: l2Plan.filter(
        (row) => row.batchesToPrep > 0 && row.prepTimeStatus !== 'CONFIRMED'
      ).length,
    }

    return NextResponse.json({
      forecast: {
        id: forecast.id,
        name: forecast.name,
        startDate: forecast.startDate,
        endDate: forecast.endDate,
      },
      l1Plan,
      l2Plan,
      prepLabourSummary,
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/prep-plan failed:', error)
    return NextResponse.json({ error: 'Failed to build prep plan' }, { status: 500 })
  }
}
