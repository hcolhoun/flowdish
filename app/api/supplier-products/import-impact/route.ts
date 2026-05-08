import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const TARGET_MARGIN_PERCENT = 75

function roundMoney(value: number) {
  return Math.round(value * 10000) / 10000
}

function marginPercent(sellingPrice: number | null, cogs: number) {
  if (!sellingPrice || sellingPrice <= 0) return null
  return ((sellingPrice - cogs) / sellingPrice) * 100
}

function suggestedPrice(cogs: number) {
  const targetFoodCostPercent = (100 - TARGET_MARGIN_PERCENT) / 100
  if (targetFoodCostPercent <= 0) return null
  return cogs / targetFoodCostPercent
}

function statusForMargin(newMargin: number | null) {
  if (newMargin === null) return 'NO_PRICE'
  if (newMargin >= TARGET_MARGIN_PERCENT) return 'GREEN'
  if (newMargin >= TARGET_MARGIN_PERCENT - 5) return 'AMBER'
  return 'RED'
}

async function getMinPriceMaps(importBatchId: string) {
  const allSupplierProducts = await prisma.supplierProduct.findMany({
    where: {
      linkedItemId: { not: null },
    },
    include: {
      priceHistory: {
        where: { importBatchId },
      },
    },
  })

  const oldPriceByL3 = new Map<string, number>()
  const newPriceByL3 = new Map<string, number>()

  for (const product of allSupplierProducts) {
    if (!product.linkedItemId) continue

    const batchHistory = product.priceHistory[0]

    const oldUnitPrice =
      batchHistory?.oldUnitPrice !== null && batchHistory?.oldUnitPrice !== undefined
        ? batchHistory.oldUnitPrice
        : product.unitPrice

    const newUnitPrice =
      batchHistory?.newUnitPrice !== null && batchHistory?.newUnitPrice !== undefined
        ? batchHistory.newUnitPrice
        : product.unitPrice

    if (oldUnitPrice !== null && oldUnitPrice !== undefined && oldUnitPrice > 0) {
      const existingOld = oldPriceByL3.get(product.linkedItemId)
      if (existingOld === undefined || oldUnitPrice < existingOld) {
        oldPriceByL3.set(product.linkedItemId, oldUnitPrice)
      }
    }

    if (newUnitPrice !== null && newUnitPrice !== undefined && newUnitPrice > 0) {
      const existingNew = newPriceByL3.get(product.linkedItemId)
      if (existingNew === undefined || newUnitPrice < existingNew) {
        newPriceByL3.set(product.linkedItemId, newUnitPrice)
      }
    }
  }

  return { oldPriceByL3, newPriceByL3 }
}

async function calculateL2UnitCost(l2ItemId: string, priceByL3: Map<string, number>) {
  const l2 = await prisma.item.findUnique({
    where: { id: l2ItemId },
  })

  if (!l2?.standardBatchOutput || l2.standardBatchOutput <= 0) return 0

  const rows = await prisma.bomL2L3.findMany({
    where: { l2ItemId },
  })

  let batchCost = 0

  for (const row of rows) {
    const unitPrice = priceByL3.get(row.l3ItemId) ?? 0
    batchCost += row.qty * unitPrice
  }

  return batchCost / l2.standardBatchOutput
}

async function calculateL1Cogs(l1ItemId: string, priceByL3: Map<string, number>) {
  const directRows = await prisma.bomL1L3.findMany({
    where: { l1ItemId },
  })

  const l2Rows = await prisma.bomL1L2.findMany({
    where: { l1ItemId },
  })

  let cogs = 0

  for (const row of directRows) {
    const unitPrice = priceByL3.get(row.l3ItemId) ?? 0
    cogs += row.qty * unitPrice
  }

  for (const row of l2Rows) {
    const l2UnitCost = await calculateL2UnitCost(row.l2ItemId, priceByL3)
    cogs += row.qty * l2UnitCost
  }

  return cogs
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const importBatchId = searchParams.get('importBatchId')

    if (!importBatchId) {
      return NextResponse.json({ error: 'Missing importBatchId' }, { status: 400 })
    }

    const importBatch = await prisma.supplierImportBatch.findUnique({
      where: { id: importBatchId },
    })

    if (!importBatch) {
      return NextResponse.json({ error: 'Import batch not found' }, { status: 404 })
    }

    const priceChanges = await prisma.supplierProductPriceHistory.findMany({
      where: { importBatchId },
      include: {
        supplierProduct: {
          include: {
            linkedItem: true,
          },
        },
      },
    })

    const changedL3Ids: string[] = Array.from(
      new Set(
        priceChanges
          .map((change) => change.supplierProduct.linkedItemId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    )

    if (changedL3Ids.length === 0) {
      return NextResponse.json({
        importBatch,
        affectedL1s: [],
      })
    }

    const directL1Rows = await prisma.bomL1L3.findMany({
      where: {
        l3ItemId: { in: changedL3Ids },
      },
      include: {
        l1: true,
        l3: true,
      },
    })

    const affectedL2Rows = await prisma.bomL2L3.findMany({
      where: {
        l3ItemId: { in: changedL3Ids },
      },
      include: {
        l2: true,
        l3: true,
      },
    })

    const affectedL2Ids: string[] = Array.from(
      new Set(affectedL2Rows.map((row) => row.l2ItemId))
    )

    const indirectL1Rows =
      affectedL2Ids.length > 0
        ? await prisma.bomL1L2.findMany({
            where: {
              l2ItemId: { in: affectedL2Ids },
            },
            include: {
              l1: true,
              l2: true,
            },
          })
        : []

    const affectedL1Map = new Map<
      string,
      {
        id: string
        sku: string
        name: string
        sellingPrice: number | null
      }
    >()

    for (const row of directL1Rows) {
      affectedL1Map.set(row.l1.id, {
        id: row.l1.id,
        sku: row.l1.sku,
        name: row.l1.name,
        sellingPrice: row.l1.sellingPrice,
      })
    }

    for (const row of indirectL1Rows) {
      affectedL1Map.set(row.l1.id, {
        id: row.l1.id,
        sku: row.l1.sku,
        name: row.l1.name,
        sellingPrice: row.l1.sellingPrice,
      })
    }

    const { oldPriceByL3, newPriceByL3 } = await getMinPriceMaps(importBatchId)

    const affectedL1s = []

    for (const l1 of affectedL1Map.values()) {
      const oldCogs = await calculateL1Cogs(l1.id, oldPriceByL3)
      const newCogs = await calculateL1Cogs(l1.id, newPriceByL3)

      const oldGrossMarginPercent = marginPercent(l1.sellingPrice, oldCogs)
      const newGrossMarginPercent = marginPercent(l1.sellingPrice, newCogs)

      const changedInputs = priceChanges
        .filter((change) => {
          const linkedItemId = change.supplierProduct.linkedItemId
          if (!linkedItemId) return false

          const isDirect = directL1Rows.some(
            (row) => row.l1ItemId === l1.id && row.l3ItemId === linkedItemId
          )

          const changedL2IdsForThisL3: string[] = affectedL2Rows
            .filter((row) => row.l3ItemId === linkedItemId)
            .map((row) => row.l2ItemId)

          const isIndirect = indirectL1Rows.some(
            (row) => row.l1ItemId === l1.id && changedL2IdsForThisL3.includes(row.l2ItemId)
          )

          return isDirect || isIndirect
        })
        .map((change) => {
          const linkedItemId = change.supplierProduct.linkedItemId

          const directUse = directL1Rows.find(
            (row) => row.l1ItemId === l1.id && row.l3ItemId === linkedItemId
          )

          const indirectL2 = linkedItemId
            ? affectedL2Rows.find((l2l3) => {
                if (l2l3.l3ItemId !== linkedItemId) return false

                return indirectL1Rows.some(
                  (l1l2) => l1l2.l1ItemId === l1.id && l1l2.l2ItemId === l2l3.l2ItemId
                )
              })
            : null

          return {
            supplier: change.supplierProduct.supplier,
            supplierSku: change.supplierProduct.supplierSku,
            supplierProductName: change.supplierProduct.name,
            l3Sku: change.supplierProduct.linkedItem?.sku ?? null,
            l3Name: change.supplierProduct.linkedItem?.name ?? null,
            oldUnitPrice: change.oldUnitPrice,
            newUnitPrice: change.newUnitPrice,
            oldPackPrice: change.oldPackPrice,
            newPackPrice: change.newPackPrice,
            usedIn: directUse ? 'DIRECT_L1_L3' : 'INDIRECT_L2_L3',
            l2Name: indirectL2?.l2.name ?? null,
            l2Sku: indirectL2?.l2.sku ?? null,
          }
        })

      affectedL1s.push({
        itemId: l1.id,
        sku: l1.sku,
        name: l1.name,
        sellingPrice: l1.sellingPrice,
        oldCogs: roundMoney(oldCogs),
        newCogs: roundMoney(newCogs),
        cogsChange: roundMoney(newCogs - oldCogs),
        oldGrossMarginPercent:
          oldGrossMarginPercent === null ? null : roundMoney(oldGrossMarginPercent),
        newGrossMarginPercent:
          newGrossMarginPercent === null ? null : roundMoney(newGrossMarginPercent),
        suggestedSellingPriceAtTargetMargin: roundMoney(suggestedPrice(newCogs) ?? 0),
        targetMarginPercent: TARGET_MARGIN_PERCENT,
        status: statusForMargin(newGrossMarginPercent),
        changedInputs,
      })
    }

    affectedL1s.sort((a, b) => Math.abs(b.cogsChange) - Math.abs(a.cogsChange))

    return NextResponse.json({
      importBatch,
      affectedL1s,
    })
  } catch (error) {
    console.error('GET /api/supplier-products/import-impact failed:', error)
    return NextResponse.json(
      { error: 'Failed to load import impact report' },
      { status: 500 }
    )
  }
}