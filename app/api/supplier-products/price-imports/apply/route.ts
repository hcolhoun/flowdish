import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'

type IncomingPriceRow = {
  supplier?: string
  supplierSku?: string | null
  name?: string
  packSize?: string | null
  weight?: string | null
  packPrice?: number | string | null
  unitPrice?: number | string | null
  selected?: boolean
}

function toMoney(value: unknown) {
  if (value === null || value === undefined || value === '') return null

  const number = Number(String(value).replace('€', '').replace(',', '').trim())

  return Number.isFinite(number) && number >= 0 ? number : null
}

function cleanText(value: unknown) {
  return String(value || '').trim()
}

function normaliseSku(value: unknown) {
  const cleaned = cleanText(value)
  return cleaned.length > 0 ? cleaned : null
}

function pricesAreSame(left: number | null, right: number | null) {
  if (left === null && right === null) return true
  if (left === null || right === null) return false

  return Math.abs(left - right) < 0.000001
}

function priceChangePercent(oldPrice: number | null, newPrice: number | null) {
  if (!oldPrice || oldPrice <= 0 || newPrice === null) return null

  return ((newPrice - oldPrice) / oldPrice) * 100
}

function warningForRow({
  existingPackPrice,
  existingUnitPrice,
  newPackPrice,
  newUnitPrice,
}: {
  existingPackPrice: number | null
  existingUnitPrice: number | null
  newPackPrice: number | null
  newUnitPrice: number | null
}) {
  const warnings: string[] = []

  const packChange = priceChangePercent(existingPackPrice, newPackPrice)
  const unitChange = priceChangePercent(existingUnitPrice, newUnitPrice)

  if (packChange !== null && Math.abs(packChange) >= 30) {
    warnings.push(`Pack price changed by ${Math.round(packChange)}%`)
  }

  if (unitChange !== null && Math.abs(unitChange) >= 30) {
    warnings.push(`Unit price changed by ${Math.round(unitChange)}%`)
  }

  if (newPackPrice === null && newUnitPrice === null) {
    warnings.push('No usable price found')
  }

  return warnings
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to update supplier prices.' },
        { status: 403 }
      )
    }

    const body = await req.json()

    const rows = Array.isArray(body.rows)
      ? body.rows
      : Array.isArray(body.products)
        ? body.products
        : []

    const fileName = body.fileName ? String(body.fileName) : null
    const requestedSupplier = body.supplier ? String(body.supplier).trim() : null

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No price rows supplied.' },
        { status: 400 }
      )
    }

    const selectedRows = rows.filter((row: IncomingPriceRow) => row.selected !== false)

    if (selectedRows.length === 0) {
      return NextResponse.json(
        { error: 'No selected rows to apply.' },
        { status: 400 }
      )
    }

    const importBatch = await prisma.supplierImportBatch.create({
      data: {
        restaurantId: tenant.restaurantId,
        supplier: requestedSupplier || 'Mixed supplier import',
        fileName,
        parsedCount: rows.length,
        createdCount: 0,
        updatedCount: 0,
        priceChangeCount: 0,
      },
    })

    let matchedCount = 0
    let updatedCount = 0
    let skippedCount = 0
    let unchangedCount = 0
    let priceChangeCount = 0

    const appliedRows = []
    const skippedRows = []

    for (const rawRow of selectedRows as IncomingPriceRow[]) {
      const supplier = cleanText(rawRow.supplier || requestedSupplier)
      const supplierSku = normaliseSku(rawRow.supplierSku)
      const newPackPrice = toMoney(rawRow.packPrice)
      const newUnitPrice = toMoney(rawRow.unitPrice)

      if (!supplier || !supplierSku) {
        skippedCount += 1
        skippedRows.push({
          supplier,
          supplierSku,
          name: rawRow.name || null,
          reason: 'Missing supplier or supplier SKU',
        })
        continue
      }

      if (newPackPrice === null && newUnitPrice === null) {
        skippedCount += 1
        skippedRows.push({
          supplier,
          supplierSku,
          name: rawRow.name || null,
          reason: 'No usable price found',
        })
        continue
      }

      const existing = await prisma.supplierProduct.findFirst({
        where: {
          restaurantId: tenant.restaurantId,
          supplier,
          supplierSku,
        },
        orderBy: {
          createdAt: 'asc',
        },
      })

      if (!existing) {
        skippedCount += 1
        skippedRows.push({
          supplier,
          supplierSku,
          name: rawRow.name || null,
          reason: 'No existing customer supplier product found for this SKU',
        })
        continue
      }

      matchedCount += 1

      const finalPackPrice = newPackPrice !== null ? newPackPrice : existing.packPrice
      const finalUnitPrice = newUnitPrice !== null ? newUnitPrice : existing.unitPrice

      const packChanged = !pricesAreSame(existing.packPrice, finalPackPrice)
      const unitChanged = !pricesAreSame(existing.unitPrice, finalUnitPrice)

      const warnings = warningForRow({
        existingPackPrice: existing.packPrice,
        existingUnitPrice: existing.unitPrice,
        newPackPrice: finalPackPrice,
        newUnitPrice: finalUnitPrice,
      })

      if (!packChanged && !unitChanged) {
        unchangedCount += 1
        appliedRows.push({
          supplier,
          supplierSku,
          name: existing.name,
          supplierProductId: existing.id,
          status: 'UNCHANGED',
          oldPackPrice: existing.packPrice,
          newPackPrice: finalPackPrice,
          oldUnitPrice: existing.unitPrice,
          newUnitPrice: finalUnitPrice,
          warnings,
        })
        continue
      }

      await prisma.supplierProduct.update({
        where: {
          id: existing.id,
        },
        data: {
          packPrice: finalPackPrice,
          unitPrice: finalUnitPrice,
        },
      })

      await prisma.supplierProductPriceHistory.create({
        data: {
          restaurantId: tenant.restaurantId,
          supplierProductId: existing.id,
          importBatchId: importBatch.id,
          oldPackPrice: existing.packPrice,
          newPackPrice: finalPackPrice,
          oldUnitPrice: existing.unitPrice,
          newUnitPrice: finalUnitPrice,
        },
      })

      updatedCount += 1
      priceChangeCount += 1

      appliedRows.push({
        supplier,
        supplierSku,
        name: existing.name,
        supplierProductId: existing.id,
        linkedItemId: existing.linkedItemId,
        status: 'UPDATED_PRICE_ONLY',
        oldPackPrice: existing.packPrice,
        newPackPrice: finalPackPrice,
        oldUnitPrice: existing.unitPrice,
        newUnitPrice: finalUnitPrice,
        warnings,
      })
    }

    const updatedBatch = await prisma.supplierImportBatch.update({
      where: {
        id: importBatch.id,
      },
      data: {
        updatedCount,
        priceChangeCount,
      },
    })

    return NextResponse.json({
      success: true,
      importBatchId: updatedBatch.id,
      importBatch: updatedBatch,
      summary: {
        parsedCount: rows.length,
        selectedCount: selectedRows.length,
        matchedCount,
        updatedCount,
        unchangedCount,
        skippedCount,
        priceChangeCount,
      },
      appliedRows,
      skippedRows,
      impactUrl: `/api/supplier-products/import-impact?importBatchId=${updatedBatch.id}`,
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('POST /api/supplier-products/price-import/apply failed:', error)

    return NextResponse.json(
      { error: 'Failed to apply supplier price import.' },
      { status: 500 }
    )
  }
}