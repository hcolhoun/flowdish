import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'

type SupplierPrice = {
  supplier: string
  supplierSku: string | null
  name: string
  packSize: string | null
  weight: string | null
  packPrice: number | null
  unitPrice: number
}

type ItemLike = {
  id: string
  sku: string
  name: string
  itemType: 'L0' | 'L1' | 'L2' | 'L3'
  unitType: 'g' | 'ml' | 'each'
  sellingPrice?: number | null
  standardBatchOutput?: number | null
}

function numberValue(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function getBestPriceForItem(
  item: ItemLike,
  pricesByItemId: Map<string, SupplierPrice[]>,
  pricesBySku: Map<string, SupplierPrice[]>
) {
  const byLinkedItem = pricesByItemId.get(item.id) ?? []
  const bySku = pricesBySku.get(item.sku.toLowerCase()) ?? []

  const candidates = [...byLinkedItem, ...bySku]
    .filter((price) => Number.isFinite(price.unitPrice) && price.unitPrice > 0)
    .sort((a, b) => a.unitPrice - b.unitPrice)

  return candidates[0] ?? null
}

export async function GET(req: Request) {
  try {
    const tenant = await requireTenant()

    const { searchParams } = new URL(req.url)
    const itemId = searchParams.get('itemId')

    if (itemId) {
      const item = await prisma.item.findFirst({
        where: {
          id: itemId,
          restaurantId: tenant.restaurantId,
        },
      })

      if (!item) {
        return NextResponse.json({ error: 'Item not found' }, { status: 404 })
      }
    }

    const [
      items,
      l1ToL2Rows,
      l1ToL3Rows,
      l2ToL2Rows,
      l2ToL3Rows,
      supplierProducts,
    ] = await Promise.all([
      prisma.item.findMany({
        where: {
          restaurantId: tenant.restaurantId,
          ...(itemId
            ? {
                OR: [
                  { id: itemId },
                  { itemType: 'L2' },
                  { itemType: 'L3' },
                ],
              }
            : {}),
        },
        orderBy: { name: 'asc' },
      }),

      prisma.bomL1L2.findMany({
        where: {
          restaurantId: tenant.restaurantId,
          ...(itemId ? { l1ItemId: itemId } : {}),
        },
        include: {
          l1: true,
          l2: true,
        },
        orderBy: { id: 'asc' },
      }),

      prisma.bomL1L3.findMany({
        where: {
          restaurantId: tenant.restaurantId,
          ...(itemId ? { l1ItemId: itemId } : {}),
        },
        include: {
          l1: true,
          l3: true,
        },
        orderBy: { id: 'asc' },
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

      prisma.supplierProduct.findMany({
        where: {
          restaurantId: tenant.restaurantId,
          unitPrice: {
            gt: 0,
          },
        },
        orderBy: [
          { unitPrice: 'asc' },
          { name: 'asc' },
        ],
      }),
    ])

    const typedItems = items as ItemLike[]

    const l1Items = typedItems.filter((item: ItemLike) => item.itemType === 'L1')

    const pricesByItemId = new Map<string, SupplierPrice[]>()
    const pricesBySku = new Map<string, SupplierPrice[]>()

    for (const product of supplierProducts as any[]) {
      const price: SupplierPrice = {
        supplier: product.supplier,
        supplierSku: product.supplierSku,
        name: product.name,
        packSize: product.packSize,
        weight: product.weight,
        packPrice: product.packPrice,
        unitPrice: numberValue(product.unitPrice),
      }

      if (product.linkedItemId) {
        const existing = pricesByItemId.get(product.linkedItemId) ?? []
        existing.push(price)
        pricesByItemId.set(product.linkedItemId, existing)
      }

      if (product.supplierSku) {
        const key = String(product.supplierSku).toLowerCase()
        const existing = pricesBySku.get(key) ?? []
        existing.push(price)
        pricesBySku.set(key, existing)
      }
    }

    const l1ToL2ByL1 = new Map<string, any[]>()
    const l1ToL3ByL1 = new Map<string, any[]>()
    const l2ToL2ByL2 = new Map<string, any[]>()
    const l2ToL3ByL2 = new Map<string, any[]>()

    for (const row of l1ToL2Rows as any[]) {
      const existing = l1ToL2ByL1.get(row.l1ItemId) ?? []
      existing.push(row)
      l1ToL2ByL1.set(row.l1ItemId, existing)
    }

    for (const row of l1ToL3Rows as any[]) {
      const existing = l1ToL3ByL1.get(row.l1ItemId) ?? []
      existing.push(row)
      l1ToL3ByL1.set(row.l1ItemId, existing)
    }

    for (const row of l2ToL2Rows as any[]) {
      const existing = l2ToL2ByL2.get(row.parentL2ItemId) ?? []
      existing.push(row)
      l2ToL2ByL2.set(row.parentL2ItemId, existing)
    }

    for (const row of l2ToL3Rows as any[]) {
      const existing = l2ToL3ByL2.get(row.l2ItemId) ?? []
      existing.push(row)
      l2ToL3ByL2.set(row.l2ItemId, existing)
    }

    const l2CostCache = new Map<string, any>()

    function calculateL2Cost(l2Item: ItemLike, stack = new Set<string>()) {
      const existing = l2CostCache.get(l2Item.id)
      if (existing) return existing

      if (stack.has(l2Item.id)) {
        return {
          itemId: l2Item.id,
          sku: l2Item.sku,
          name: l2Item.name,
          unitType: l2Item.unitType,
          standardBatchOutput: l2Item.standardBatchOutput ?? null,
          batchCost: 0,
          costPerUnit: null,
          missingCostCount: 1,
          outputMissing: false,
          ingredients: [],
          prepComponents: [],
        }
      }

      const nextStack = new Set(stack)
      nextStack.add(l2Item.id)

      const childL2Rows = l2ToL2ByL2.get(l2Item.id) ?? []
      const ingredientRows = l2ToL3ByL2.get(l2Item.id) ?? []
      const standardBatchOutput = l2Item.standardBatchOutput ?? null

      let batchCost = 0
      let missingCostCount = 0
      const ingredients: any[] = []
      const prepComponents: any[] = []

      for (const row of childL2Rows) {
        const childL2 = row.childL2 as ItemLike
        const qty = numberValue(row.qty)
        const childCost = calculateL2Cost(childL2, nextStack)

        const lineCost =
          childCost.costPerUnit !== null && childCost.costPerUnit !== undefined
            ? qty * childCost.costPerUnit
            : null

        if (lineCost === null) {
          missingCostCount++
        } else {
          batchCost += lineCost
        }

        if (childCost.missingCostCount > 0) {
          missingCostCount += childCost.missingCostCount
        }

        prepComponents.push({
          itemId: childL2.id,
          sku: childL2.sku,
          name: childL2.name,
          qty,
          unitType: childL2.unitType,
          standardBatchOutput: childCost.standardBatchOutput,
          batchCost: childCost.batchCost,
          costPerUnit: childCost.costPerUnit,
          lineCost,
          missingCostCount: childCost.missingCostCount,
        })
      }

      for (const row of ingredientRows) {
        const l3 = row.l3 as ItemLike
        const qty = numberValue(row.qty)
        const bestPrice = getBestPriceForItem(l3, pricesByItemId, pricesBySku)

        const lineCost = bestPrice ? qty * bestPrice.unitPrice : null

        if (lineCost === null) {
          missingCostCount++
        } else {
          batchCost += lineCost
        }

        ingredients.push({
          itemId: l3.id,
          sku: l3.sku,
          name: l3.name,
          qty,
          unitType: l3.unitType,
          unitPrice: bestPrice?.unitPrice ?? null,
          supplier: bestPrice?.supplier ?? null,
          supplierSku: bestPrice?.supplierSku ?? null,
          supplierProductName: bestPrice?.name ?? null,
          lineCost,
          missingReason: bestPrice ? null : 'Missing supplier price',
        })
      }

      let costPerUnit: number | null = null
      let outputMissing = false

      if (standardBatchOutput && standardBatchOutput > 0) {
        costPerUnit = batchCost / standardBatchOutput
      } else {
        outputMissing = true
      }

      if (outputMissing) {
        missingCostCount++
      }

      const result = {
        itemId: l2Item.id,
        sku: l2Item.sku,
        name: l2Item.name,
        unitType: l2Item.unitType,
        standardBatchOutput,
        batchCost,
        costPerUnit,
        missingCostCount,
        outputMissing,
        ingredients,
        prepComponents,
      }

      l2CostCache.set(l2Item.id, result)
      return result
    }

    const results = []

    for (const l1 of l1Items as any[]) {
      const directL3Rows = l1ToL3ByL1.get(l1.id) ?? []
      const l2Rows = l1ToL2ByL1.get(l1.id) ?? []

      let foodCost = 0
      let missingCostCount = 0
      const directIngredients: any[] = []
      const prepComponents: any[] = []

      for (const row of directL3Rows) {
        const l3 = row.l3 as ItemLike
        const qty = numberValue(row.qty)
        const bestPrice = getBestPriceForItem(l3, pricesByItemId, pricesBySku)

        const lineCost = bestPrice ? qty * bestPrice.unitPrice : null

        if (lineCost === null) {
          missingCostCount++
        } else {
          foodCost += lineCost
        }

        directIngredients.push({
          type: 'L3',
          itemId: l3.id,
          sku: l3.sku,
          name: l3.name,
          qty,
          unitType: l3.unitType,
          unitPrice: bestPrice?.unitPrice ?? null,
          supplier: bestPrice?.supplier ?? null,
          supplierSku: bestPrice?.supplierSku ?? null,
          supplierProductName: bestPrice?.name ?? null,
          lineCost,
          missingReason: bestPrice ? null : 'Missing supplier price',
        })
      }

      for (const row of l2Rows) {
        const l2 = row.l2 as ItemLike
        const qty = numberValue(row.qty)
        const l2Cost = calculateL2Cost(l2)

        let lineCost: number | null = null
        let missingReason: string | null = null

        if (l2Cost.costPerUnit === null) {
          missingReason = 'Missing L2 standard batch output or nested L2 cost'
          missingCostCount++
        } else {
          lineCost = qty * l2Cost.costPerUnit
          foodCost += lineCost
        }

        if (l2Cost.missingCostCount > 0) {
          missingCostCount += l2Cost.missingCostCount
        }

        prepComponents.push({
          type: 'L2',
          itemId: l2.id,
          sku: l2.sku,
          name: l2.name,
          qty,
          unitType: l2.unitType,
          standardBatchOutput: l2Cost.standardBatchOutput,
          batchCost: l2Cost.batchCost,
          costPerUnit: l2Cost.costPerUnit,
          lineCost,
          missingReason,
          missingCostCount: l2Cost.missingCostCount,
          ingredients: l2Cost.ingredients,
          prepComponents: l2Cost.prepComponents,
        })
      }

      const sellingPrice = l1.sellingPrice ?? null
      const grossProfit =
        sellingPrice !== null && sellingPrice > 0 ? sellingPrice - foodCost : null

      const grossMarginPercent =
        sellingPrice !== null && sellingPrice > 0 && grossProfit !== null
          ? (grossProfit / sellingPrice) * 100
          : null

      const foodCostPercent =
        sellingPrice !== null && sellingPrice > 0
          ? (foodCost / sellingPrice) * 100
          : null

      results.push({
        itemId: l1.id,
        sku: l1.sku,
        name: l1.name,
        sellingPrice,
        foodCost,
        grossProfit,
        grossMarginPercent,
        foodCostPercent,
        missingCostCount,
        isEstimated: missingCostCount > 0,
        directIngredients,
        prepComponents,
      })
    }

    return NextResponse.json(itemId ? results[0] ?? null : results)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/costing/l1 failed:', error)
    return NextResponse.json(
      { error: 'Failed to calculate L1 costing' },
      { status: 500 }
    )
  }
}