export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type StockPosition = {
  totalStock: number
  usableStock: number
  expiringBeforeForecastEnd: number
  expiredStock: number
  nextExpiry: Date | null
  daysToNextExpiry: number | null
}

function daysBetween(from: Date, to: Date) {
  const ms = to.getTime() - from.getTime()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

async function getStockPosition(
  itemId: string,
  forecastEndDate: Date
): Promise<StockPosition> {
  const now = new Date()

  const lots = await prisma.inventoryLot.findMany({
    where: {
      itemId,
      qtyRemaining: { gt: 0 },
    },
    orderBy: [{ expiryAt: 'asc' }, { createdAt: 'asc' }],
  })

  let totalStock = 0
  let usableStock = 0
  let expiringBeforeForecastEnd = 0
  let expiredStock = 0
  let nextExpiry: Date | null = null

  for (const lot of lots) {
    totalStock += lot.qtyRemaining

    if (lot.expiryAt && !nextExpiry) {
      nextExpiry = lot.expiryAt
    }

    if (lot.expiryAt && lot.expiryAt < now) {
      expiredStock += lot.qtyRemaining
      continue
    }

    if (lot.expiryAt && lot.expiryAt < forecastEndDate) {
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

function makeableFrom(stock: number, qtyPerUnit: number) {
  if (!qtyPerUnit || qtyPerUnit <= 0) return 0
  return Math.floor(stock / qtyPerUnit)
}

function addToMap(map: Map<string, number>, key: string, qty: number) {
  map.set(key, (map.get(key) ?? 0) + qty)
}

function buildExpiryStatus(stock: StockPosition, shortfallQty: number, shortageLabel: string) {
  if (shortfallQty > 0) return shortageLabel
  if (stock.expiredStock > 0) return 'EXPIRED STOCK'
  if (stock.expiringBeforeForecastEnd > 0) return 'EXPIRING BEFORE FORECAST ENDS'
  if (stock.daysToNextExpiry !== null && stock.daysToNextExpiry <= 2) return 'USE SOON'
  return 'OK'
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const forecastId = searchParams.get('forecastId')

    if (!forecastId) {
      return NextResponse.json({ error: 'Missing forecastId' }, { status: 400 })
    }

    const forecast = await prisma.forecast.findUnique({
      where: { id: forecastId },
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

    const l1Plan = []
    const l2RequiredMap = new Map<string, number>()
    const directL3RequiredMap = new Map<string, number>()

    for (const line of forecast.lines) {
      const l1Item = line.item

      if (l1Item.itemType !== 'L1') continue

      const bomL1L2 = await prisma.bomL1L2.findMany({
        where: { l1ItemId: l1Item.id },
        include: { l2: true },
      })

      const bomL1L3 = await prisma.bomL1L3.findMany({
        where: { l1ItemId: l1Item.id },
        include: { l3: true },
      })

      let makeableQty = Number.POSITIVE_INFINITY

      for (const row of bomL1L2) {
        const stock = await getStockPosition(row.l2ItemId, forecastEndDate)
        makeableQty = Math.min(makeableQty, makeableFrom(stock.usableStock, row.qty))
      }

      for (const row of bomL1L3) {
        const stock = await getStockPosition(row.l3ItemId, forecastEndDate)
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

      for (const row of bomL1L2) {
        addToMap(l2RequiredMap, row.l2ItemId, row.qty * forecastQty)
      }

      for (const row of bomL1L3) {
        addToMap(directL3RequiredMap, row.l3ItemId, row.qty * forecastQty)
      }
    }

    const l2Plan = []
    const l2ShortfallMap = new Map<string, number>()

    for (const [l2ItemId, requiredQty] of l2RequiredMap.entries()) {
      const item = await prisma.item.findUnique({
        where: { id: l2ItemId },
      })

      if (!item) continue

      const stock = await getStockPosition(l2ItemId, forecastEndDate)
      const shortfallQty = Math.max(0, requiredQty - stock.usableStock)
      const standardBatchOutput = item.standardBatchOutput ?? null

      const batchesToPrep =
        standardBatchOutput && standardBatchOutput > 0
          ? Math.ceil(shortfallQty / standardBatchOutput)
          : 0

      if (shortfallQty > 0) {
        l2ShortfallMap.set(l2ItemId, shortfallQty)
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
        shelfLifeDays: item.shelfLifeDays ?? null,
        nextExpiry: stock.nextExpiry,
        daysToNextExpiry: stock.daysToNextExpiry,
        expiryStatus: buildExpiryStatus(stock, shortfallQty, 'PREP REQUIRED'),
      })
    }

    const l3RequiredMap = new Map<string, number>()

    for (const [l3ItemId, requiredQty] of directL3RequiredMap.entries()) {
      addToMap(l3RequiredMap, l3ItemId, requiredQty)
    }

    for (const [l2ItemId, l2ShortfallQty] of l2ShortfallMap.entries()) {
      const bomL2L3 = await prisma.bomL2L3.findMany({
        where: { l2ItemId },
        include: { l3: true },
      })

      for (const row of bomL2L3) {
        addToMap(l3RequiredMap, row.l3ItemId, row.qty * l2ShortfallQty)
      }
    }

    const l3Plan = []

    for (const [l3ItemId, requiredQty] of l3RequiredMap.entries()) {
      const item = await prisma.item.findUnique({
        where: { id: l3ItemId },
      })

      if (!item) continue

      const stock = await getStockPosition(l3ItemId, forecastEndDate)
      const shortfallQty = Math.max(0, requiredQty - stock.usableStock)

      l3Plan.push({
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
        shelfLifeDays: item.shelfLifeDays ?? null,
        nextExpiry: stock.nextExpiry,
        daysToNextExpiry: stock.daysToNextExpiry,
        expiryStatus: buildExpiryStatus(stock, shortfallQty, 'ORDER REQUIRED'),
      })
    }

    l2Plan.sort((a, b) => {
      if (b.shortfallQty !== a.shortfallQty) return b.shortfallQty - a.shortfallQty
      return a.name.localeCompare(b.name)
    })

    l3Plan.sort((a, b) => {
      if (b.shortfallQty !== a.shortfallQty) return b.shortfallQty - a.shortfallQty
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json(
      {
        forecast: {
          id: forecast.id,
          name: forecast.name,
          startDate: forecast.startDate,
          endDate: forecast.endDate,
        },
        l1Plan,
        l2Plan,
        l3Plan,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (error) {
    console.error('GET /api/prep-plan failed:', error)
    return NextResponse.json({ error: 'Failed to build prep plan' }, { status: 500 })
  }
}