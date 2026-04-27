import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getStockByItemId } from '@/lib/inventory'

type L1PlanRow = {
  itemId: string
  sku: string
  name: string
  forecastQty: number
  makeableQty: number
  shortfallQty: number
}

type L2PlanRow = {
  itemId: string
  sku: string
  name: string
  requiredQty: number
  currentStock: number
  shortfallQty: number
  standardBatchOutput: number | null
  batchesToPrep: number
  shelfLifeDays: number | null
}

function floorPositive(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.floor(value)
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
          include: {
            item: true,
          },
        },
      },
    })

    if (!forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    const l1Plan: L1PlanRow[] = []
    const l2RequiredMap = new Map<string, number>()

    for (const line of forecast.lines) {
      const l1Item = line.item

      if (l1Item.itemType !== 'L1') {
        continue
      }

      const bomL1L2 = await prisma.bomL1L2.findMany({
        where: { l1ItemId: l1Item.id },
        include: { l2: true },
      })

      const bomL1L3 = await prisma.bomL1L3.findMany({
        where: { l1ItemId: l1Item.id },
        include: { l3: true },
      })

      let makeableFromL2 = Number.POSITIVE_INFINITY
      let makeableFromL3 = Number.POSITIVE_INFINITY

      if (bomL1L2.length > 0) {
        for (const row of bomL1L2) {
          const stock = await getStockByItemId(row.l2ItemId)
          const possible = row.qty > 0 ? stock / row.qty : 0
          makeableFromL2 = Math.min(makeableFromL2, possible)
        }
      }

      if (bomL1L3.length > 0) {
        for (const row of bomL1L3) {
          const stock = await getStockByItemId(row.l3ItemId)
          const possible = row.qty > 0 ? stock / row.qty : 0
          makeableFromL3 = Math.min(makeableFromL3, possible)
        }
      }

      let makeableQty = 0

      if (bomL1L2.length > 0 && bomL1L3.length > 0) {
        makeableQty = floorPositive(Math.min(makeableFromL2, makeableFromL3))
      } else if (bomL1L2.length > 0) {
        makeableQty = floorPositive(makeableFromL2)
      } else if (bomL1L3.length > 0) {
        makeableQty = floorPositive(makeableFromL3)
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
        for (const row of bomL1L2) {
          const addQty = row.qty * shortfallQty
          const current = l2RequiredMap.get(row.l2ItemId) ?? 0
          l2RequiredMap.set(row.l2ItemId, current + addQty)
        }
      }
    }

    const l2Plan: L2PlanRow[] = []

    for (const [l2ItemId, requiredQty] of l2RequiredMap.entries()) {
      const item = await prisma.item.findUnique({
        where: { id: l2ItemId },
      })

      if (!item) continue

      const currentStock = await getStockByItemId(l2ItemId)
      const shortfallQty = Math.max(0, requiredQty - currentStock)
      const standardBatchOutput = item.standardBatchOutput ?? null
      const batchesToPrep =
        standardBatchOutput && standardBatchOutput > 0
          ? Math.ceil(shortfallQty / standardBatchOutput)
          : 0

      l2Plan.push({
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        requiredQty,
        currentStock,
        shortfallQty,
        standardBatchOutput,
        batchesToPrep,
        shelfLifeDays: item.shelfLifeDays ?? null,
      })
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
    })
  } catch (error) {
    console.error('GET /api/prep-plan failed:', error)
    return NextResponse.json({ error: 'Failed to build prep plan' }, { status: 500 })
  }
}