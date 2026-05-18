import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'

type ItemRow = {
  id: string
  sku: string
  name: string
  itemType: 'L0' | 'L1' | 'L2' | 'L3'
  unitType: 'g' | 'ml' | 'each'
  standardBatchOutput: number | null
}

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
    const tenant = await requireTenant()

    const [itemsRaw, supplierProducts, l2ToL2RowsRaw, l2ToL3RowsRaw] =
      await Promise.all([
        prisma.item.findMany({
          where: {
            restaurantId: tenant.restaurantId,
          },
          orderBy: { name: 'asc' },
        }),

        prisma.supplierProduct.findMany({
          where: {
            restaurantId: tenant.restaurantId,
            unitPrice: {
              gt: 0,
            },
          },
          orderBy: [{ unitPrice: 'asc' }, { name: 'asc' }],
        }),

        prisma.bomL2L2.findMany({
          where: {
            restaurantId: tenant.restaurantId,
          },
          include: {
            parentL2: true,
            childL2: true,
          },
          orderBy: { id: 'asc' },
        }),

        prisma.bomL2L3.findMany({
          where: {
            restaurantId: tenant.restaurantId,
          },
          include: {
            l2: true,
            l3: true,
          },
          orderBy: { id: 'asc' },
        }),
      ])

    const items = itemsRaw as ItemRow[]
    const l2ToL2Rows = l2ToL2RowsRaw as any[]
    const l2ToL3Rows = l2ToL3RowsRaw as any[]

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

    const l2ToL2ByParent = new Map<string, any[]>()
    const l2ToL3ByParent = new Map<string, any[]>()

    for (const row of l2ToL2Rows) {
      const existing = l2ToL2ByParent.get(row.parentL2ItemId) ?? []
      existing.push(row)
      l2ToL2ByParent.set(row.parentL2ItemId, existing)
    }

    for (const row of l2ToL3Rows) {
      const existing = l2ToL3ByParent.get(row.l2ItemId) ?? []
      existing.push(row)
      l2ToL3ByParent.set(row.l2ItemId, existing)
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

    const itemById = new Map<string, ItemRow>(
      items.map((item: ItemRow) => [item.id, item])
    )

    function calculateL2Cost(l2ItemId: string, stack = new Set<string>()) {
      const cached = l2CostsByItemId[l2ItemId]
      if (cached) return cached

      const item = itemById.get(l2ItemId)

      if (!item || item.itemType !== 'L2') {
        return null
      }

      if (stack.has(l2ItemId)) {
        return {
          itemId: item.id,
          sku: item.sku,
          name: item.name,
          unitType: item.unitType,
          standardBatchOutput: item.standardBatchOutput ?? null,
          batchCost: 0,
          costPerUnit: null,
          missingCostCount: 1,
        }
      }

      const nextStack = new Set(stack)
      nextStack.add(l2ItemId)

      const childL2Rows = l2ToL2ByParent.get(l2ItemId) ?? []
      const childL3Rows = l2ToL3ByParent.get(l2ItemId) ?? []

      let batchCost = 0
      let missingCostCount = 0

      for (const row of childL2Rows) {
        const childCost = calculateL2Cost(row.childL2ItemId, nextStack)
        const qty = numberValue(row.qty)

        if (!childCost || childCost.costPerUnit === null) {
          missingCostCount++
          continue
        }

        if (childCost.missingCostCount > 0) {
          missingCostCount += childCost.missingCostCount
        }

        batchCost += qty * childCost.costPerUnit
      }

      for (const row of childL3Rows) {
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

      const result = {
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        unitType: item.unitType,
        standardBatchOutput,
        batchCost,
        costPerUnit,
        missingCostCount,
      }

      l2CostsByItemId[item.id] = result

      return result
    }

    for (const item of items) {
      if (item.itemType === 'L2') {
        calculateL2Cost(item.id)
      }
    }

    return NextResponse.json({
      l3PricesByItemId,
      l2CostsByItemId,
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/bom-costing failed:', error)
    return NextResponse.json(
      { error: 'Failed to load BOM costing data' },
      { status: 500 }
    )
  }
}