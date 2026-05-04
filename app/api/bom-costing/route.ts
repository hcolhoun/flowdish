import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type PriceInfo = {
  unitPrice: number
  supplier: string
  supplierSku: string | null
  productName: string
  packPrice: number | null
  weight: string | null
}

function numberValue(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export async function GET() {
  try {
    const [items, supplierProducts, l2BomRows] = await Promise.all([
      prisma.item.findMany({
        orderBy: { name: 'asc' },
      }),

      prisma.supplierProduct.findMany({
        where: {
          unitPrice: {
            gt: 0,
          },
        },
        orderBy: [
          { unitPrice: 'asc' },
          { name: 'asc' },
        ],
      }),

      prisma.bomL2L3.findMany({
        include: {
          l2: true,
          l3: true,
        },
        orderBy: { id: 'asc' },
      }),
    ])

    const l3PricesByItemId: Record<string, PriceInfo> = {}
    const pricesByItemId = new Map<string, PriceInfo[]>()
    const pricesBySku = new Map<string, PriceInfo[]>()

    for (const product of supplierProducts) {
      const price: PriceInfo = {
        unitPrice: numberValue(product.unitPrice),
        supplier: product.supplier,
        supplierSku: product.supplierSku,
        productName: product.name,
        packPrice: product.packPrice,
        weight: product.weight,
      }

      if (product.linkedItemId) {
        const existing = pricesByItemId.get(product.linkedItemId) ?? []
        existing.push(price)
        pricesByItemId.set(product.linkedItemId, existing)
      }

      if (product.supplierSku) {
        const key = product.supplierSku.toLowerCase()
        const existing = pricesBySku.get(key) ?? []
        existing.push(price)
        pricesBySku.set(key, existing)
      }
    }

    for (const item of items) {
      if (item.itemType !== 'L3') continue

      const candidates = [
        ...(pricesByItemId.get(item.id) ?? []),
        ...(pricesBySku.get(item.sku.toLowerCase()) ?? []),
      ].sort((a, b) => a.unitPrice - b.unitPrice)

      if (candidates[0]) {
        l3PricesByItemId[item.id] = candidates[0]
      }
    }

    const l2RowsByItemId = new Map<string, typeof l2BomRows>()

    for (const row of l2BomRows) {
      const existing = l2RowsByItemId.get(row.l2ItemId) ?? []
      existing.push(row)
      l2RowsByItemId.set(row.l2ItemId, existing)
    }

    const l2CostsByItemId: Record<
      string,
      {
        itemId: string
        sku: string
        name: string
        unitType: string
        standardBatchOutput: number | null
        batchCost: number
        costPerUnit: number | null
        missingCostCount: number
      }
    > = {}

    for (const item of items) {
      if (item.itemType !== 'L2') continue

      const rows = l2RowsByItemId.get(item.id) ?? []
      let batchCost = 0
      let missingCostCount = 0

      for (const row of rows) {
        const price = l3PricesByItemId[row.l3ItemId]
        const qty = numberValue(row.qty)

        if (!price) {
          missingCostCount++
          continue
        }

        batchCost += qty * price.unitPrice
      }

      const standardBatchOutput = item.standardBatchOutput ?? null
      const costPerUnit =
        standardBatchOutput && standardBatchOutput > 0
          ? batchCost / standardBatchOutput
          : null

      if (!standardBatchOutput || standardBatchOutput <= 0) {
        missingCostCount++
      }

      l2CostsByItemId[item.id] = {
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        unitType: item.unitType,
        standardBatchOutput,
        batchCost,
        costPerUnit,
        missingCostCount,
      }
    }

    return NextResponse.json({
      l3PricesByItemId,
      l2CostsByItemId,
    })
  } catch (error) {
    console.error('GET /api/bom-costing failed:', error)
    return NextResponse.json(
      { error: 'Failed to load BOM costing data' },
      { status: 500 }
    )
  }
}