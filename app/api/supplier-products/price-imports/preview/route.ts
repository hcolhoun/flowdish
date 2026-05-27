import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'

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

function warningsForRow({
  oldPackPrice,
  oldUnitPrice,
  newPackPrice,
  newUnitPrice,
}: {
  oldPackPrice: number | null
  oldUnitPrice: number | null
  newPackPrice: number | null
  newUnitPrice: number | null
}) {
  const warnings: string[] = []

  const packChange = priceChangePercent(oldPackPrice, newPackPrice)
  const unitChange = priceChangePercent(oldUnitPrice, newUnitPrice)

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
    const body = await req.json()

    const rows = Array.isArray(body.rows)
      ? body.rows
      : Array.isArray(body.products)
        ? body.products
        : []

    const requestedSupplier = body.supplier ? String(body.supplier).trim() : null

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No price rows supplied.' },
        { status: 400 }
      )
    }

    const matchedRows = []
    const skippedRows = []
    const unchangedRows = []
    const changedRows = []

    for (const rawRow of rows as IncomingPriceRow[]) {
      const supplier = cleanText(rawRow.supplier || requestedSupplier)
      const supplierSku = normaliseSku(rawRow.supplierSku)
      const newPackPrice = toMoney(rawRow.packPrice)
      const newUnitPrice = toMoney(rawRow.unitPrice)

      if (!supplier || !supplierSku) {
        skippedRows.push({
          supplier,
          supplierSku,
          parsedName: rawRow.name || null,
          reason: 'Missing supplier or supplier SKU',
        })
        continue
      }

      if (newPackPrice === null && newUnitPrice === null) {
        skippedRows.push({
          supplier,
          supplierSku,
          parsedName: rawRow.name || null,
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
        include: {
          linkedItem: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      })

      if (!existing) {
        skippedRows.push({
          supplier,
          supplierSku,
          parsedName: rawRow.name || null,
          reason: 'No existing customer supplier product found for this SKU',
        })
        continue
      }

      const finalPackPrice = newPackPrice !== null ? newPackPrice : existing.packPrice
      const finalUnitPrice = newUnitPrice !== null ? newUnitPrice : existing.unitPrice

      const packChanged = !pricesAreSame(existing.packPrice, finalPackPrice)
      const unitChanged = !pricesAreSame(existing.unitPrice, finalUnitPrice)

      const comparison = {
        selected: packChanged || unitChanged,
        supplier,
        supplierSku,
        supplierProductId: existing.id,
        existingName: existing.name,
        parsedName: rawRow.name || null,
        linkedL3Name: existing.linkedItem?.name ?? null,
        linkedL3Sku: existing.linkedItem?.sku ?? null,
        oldPackPrice: existing.packPrice,
        newPackPrice: finalPackPrice,
        oldUnitPrice: existing.unitPrice,
        newUnitPrice: finalUnitPrice,
        packChanged,
        unitChanged,
        warnings: warningsForRow({
          oldPackPrice: existing.packPrice,
          oldUnitPrice: existing.unitPrice,
          newPackPrice: finalPackPrice,
          newUnitPrice: finalUnitPrice,
        }),
      }

      matchedRows.push(comparison)

      if (packChanged || unitChanged) {
        changedRows.push(comparison)
      } else {
        unchangedRows.push(comparison)
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        parsedCount: rows.length,
        matchedCount: matchedRows.length,
        changedCount: changedRows.length,
        unchangedCount: unchangedRows.length,
        skippedCount: skippedRows.length,
      },
      matchedRows,
      changedRows,
      unchangedRows,
      skippedRows,
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('POST /api/supplier-products/price-imports/preview failed:', error)

    return NextResponse.json(
      { error: 'Failed to preview supplier price import.' },
      { status: 500 }
    )
  }
}