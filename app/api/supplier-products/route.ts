import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'

type BaseUnit = 'g' | 'ml' | 'each'

function parseWeightToBaseAmount(weight: string | null | undefined): {
  amount: number
  unitType: BaseUnit
} | null {
  if (!weight) return null

  const cleaned = weight.trim().toLowerCase().replace(',', '.')
  const match = cleaned.match(/(\d+(?:\.\d+)?)\s?(kg|g|ml|l)\b/)

  if (!match) return null

  const amount = Number(match[1])
  const unit = match[2]

  if (!Number.isFinite(amount) || amount <= 0) return null

  if (unit === 'kg') return { amount: amount * 1000, unitType: 'g' }
  if (unit === 'g') return { amount, unitType: 'g' }
  if (unit === 'l') return { amount: amount * 1000, unitType: 'ml' }
  if (unit === 'ml') return { amount, unitType: 'ml' }

  return null
}

function extractWeightFromText(value: string | null | undefined) {
  if (!value) return null

  const matches = Array.from(value.matchAll(/(\d+(?:\.\d+)?\s?(?:kg|g|ml|l))\b/gi))

  if (matches.length === 0) return null

  return matches[matches.length - 1][1]
}

function normaliseProductName(name: string, weight: string | null) {
  let cleaned = name.trim().replace(/\s+/g, ' ')

  if (weight) {
    cleaned = cleaned.replace(new RegExp(weight.replace(/\s+/g, '\\s?'), 'i'), '')
  }

  return cleaned
    .replace(/\b(Box|Bag|Net|Pre-Pack|Bunch|Unit|Loose|Retail|Vac Pack)\s*$/i, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function calculateBaseUnitPrice(product: {
  packPrice: number | null
  unitPrice: number | null
  weight: string | null
}) {
  const parsedWeight = parseWeightToBaseAmount(product.weight)

  if (
    product.unitPrice !== null &&
    product.unitPrice !== undefined &&
    Number.isFinite(product.unitPrice) &&
    product.unitPrice > 0
  ) {
    if (parsedWeight?.unitType === 'g') {
      return product.unitPrice > 1 ? product.unitPrice / 1000 : product.unitPrice
    }

    if (parsedWeight?.unitType === 'ml') {
      return product.unitPrice > 1 ? product.unitPrice / 1000 : product.unitPrice
    }

    return product.unitPrice
  }

  if (product.packPrice && parsedWeight && parsedWeight.amount > 0) {
    return product.packPrice / parsedWeight.amount
  }

  return null
}

function inferUnitType(product: any): 'g' | 'ml' | 'each' {
  const parsedWeight = parseWeightToBaseAmount(product.weight)

  if (parsedWeight?.unitType === 'g') return 'g'
  if (parsedWeight?.unitType === 'ml') return 'ml'

  const text = `${product.name || ''} ${product.packSize || ''} ${
    product.weight || ''
  }`.toLowerCase()

  if (/\d+(\.\d+)?\s?(kg|g)\b/.test(text)) return 'g'
  if (/\d+(\.\d+)?\s?(l|ltr|litre|ml)\b/.test(text)) return 'ml'

  return 'each'
}

function inferShelfLifeDays(product: any): number {
  const text = `${product.name || ''} ${product.packSize || ''} ${
    product.weight || ''
  }`.toLowerCase()

  const isVacuum = text.includes('vac') || text.includes('vacuum')

  const isMeat =
    text.includes('beef') ||
    text.includes('chicken') ||
    text.includes('pork') ||
    text.includes('lamb') ||
    text.includes('bacon') ||
    text.includes('sausage') ||
    text.includes('turkey') ||
    text.includes('duck') ||
    text.includes('ham') ||
    text.includes('mince')

  const isFish =
    text.includes('fish') ||
    text.includes('salmon') ||
    text.includes('cod') ||
    text.includes('hake') ||
    text.includes('tuna') ||
    text.includes('prawn') ||
    text.includes('seafood')

  if (isVacuum && isMeat) return 7
  if (isMeat || isFish) return 3

  return 5
}

function makeSku(product: any) {
  if (product.supplierSku) return String(product.supplierSku).trim()

  return `${product.supplier}-${product.name}`
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function toNullableNumber(value: any) {
  if (value === null || value === undefined || value === '') return null

  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function pricesChanged({
  oldPackPrice,
  newPackPrice,
  oldUnitPrice,
  newUnitPrice,
}: {
  oldPackPrice: number | null
  newPackPrice: number | null
  oldUnitPrice: number | null
  newUnitPrice: number | null
}) {
  const normalise = (value: number | null) => {
    if (value === null || value === undefined) return null
    return Number(value.toFixed(8))
  }

  return (
    normalise(oldPackPrice) !== normalise(newPackPrice) ||
    normalise(oldUnitPrice) !== normalise(newUnitPrice)
  )
}

async function createOrLinkL3({
  restaurantId,
  product,
}: {
  restaurantId: string
  product: any
}) {
  const sku = makeSku(product)
  const unitType = inferUnitType(product)
  const shelfLifeDays = inferShelfLifeDays(product)

  let item = await prisma.item.findFirst({
    where: {
      restaurantId,
      sku,
    },
  })

  if (!item) {
    item = await prisma.item.create({
      data: {
        restaurantId,
        sku,
        name: product.name,
        itemType: 'L3',
        unitType,
        shelfLifeDays,
        sellingPrice: null,
        standardBatchOutput: null,
        buildStatus: 'BUILT',
      },
    })
  } else if (item.itemType === 'L3' && item.unitType !== unitType) {
    item = await prisma.item.update({
      where: { id: item.id },
      data: { unitType },
    })
  }

  return item
}

async function findExistingSupplierProduct({
  restaurantId,
  cleanProduct,
}: {
  restaurantId: string
  cleanProduct: {
    supplier: string
    supplierSku: string | null
    name: string
  }
}) {
  if (cleanProduct.supplierSku) {
    const bySku = await prisma.supplierProduct.findFirst({
      where: {
        restaurantId,
        supplier: cleanProduct.supplier,
        supplierSku: cleanProduct.supplierSku,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    if (bySku) return bySku
  }

  return prisma.supplierProduct.findFirst({
    where: {
      restaurantId,
      supplier: cleanProduct.supplier,
      supplierSku: cleanProduct.supplierSku,
      name: cleanProduct.name,
    },
    orderBy: {
      createdAt: 'asc',
    },
  })
}

export async function GET() {
  try {
    const tenant = await requireTenant()

    const products = await prisma.supplierProduct.findMany({
      where: {
        restaurantId: tenant.restaurantId,
      },
      include: {
        linkedItem: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json(products)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/supplier-products failed:', error)
    return NextResponse.json({ error: 'Failed to load supplier products' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to update supplier products.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const products = body.products
    const fileName = body.fileName ? String(body.fileName) : null
    const supplierName = body.supplier ? String(body.supplier) : 'Mixed'

    if (!Array.isArray(products)) {
      return NextResponse.json({ error: 'Products must be an array' }, { status: 400 })
    }

    const deduped = new Map<string, any>()

    for (const product of products as any[]) {
      const supplier = String(product.supplier || supplierName || '').trim()
      const supplierSku = product.supplierSku ? String(product.supplierSku).trim() : null
      const name = String(product.name || '').trim()

      if (!supplier || !name) continue

      const key = supplierSku
        ? `${supplier}::${supplierSku}`
        : `${supplier}::NO-SKU::${name.toLowerCase()}`

      deduped.set(key, product)
    }

    const importBatch = await prisma.supplierImportBatch.create({
      data: {
        restaurantId: tenant.restaurantId,
        supplier: supplierName,
        fileName,
        parsedCount: deduped.size,
      },
    })

    let createdCount = 0
    let updatedCount = 0
    let linkedCount = 0
    let priceChangeCount = 0
    let skippedCount = 0

    for (const product of deduped.values()) {
      const rawName = String(product.name || '').trim()
      const inferredWeight =
        product.weight ? String(product.weight).trim() : extractWeightFromText(rawName)

      const cleanName = normaliseProductName(rawName, inferredWeight)

      const packPrice = toNullableNumber(product.packPrice)
      const parsedUnitOrKiloPrice = toNullableNumber(product.unitPrice)

      const cleanProduct = {
        supplier: String(product.supplier || supplierName || '').trim(),
        supplierSku: product.supplierSku ? String(product.supplierSku).trim() : null,
        name: cleanName,
        packSize: product.packSize ? String(product.packSize).trim() : null,
        weight: inferredWeight,
        packPrice,
        unitPrice: parsedUnitOrKiloPrice,
      }

      cleanProduct.unitPrice = calculateBaseUnitPrice(cleanProduct)

      if (!cleanProduct.name || cleanProduct.name.length < 3) {
        skippedCount++
        continue
      }

      if (!cleanProduct.supplier) {
        skippedCount++
        continue
      }

      const linkedItem = await createOrLinkL3({
        restaurantId: tenant.restaurantId,
        product: cleanProduct,
      })

      const existing = await findExistingSupplierProduct({
        restaurantId: tenant.restaurantId,
        cleanProduct,
      })

      if (existing) {
        const changed = pricesChanged({
          oldPackPrice: existing.packPrice,
          newPackPrice: cleanProduct.packPrice,
          oldUnitPrice: existing.unitPrice,
          newUnitPrice: cleanProduct.unitPrice,
        })

        const updated = await prisma.supplierProduct.update({
          where: {
            id: existing.id,
          },
          data: {
            ...cleanProduct,
            linkedItemId: existing.linkedItemId || linkedItem.id,
          },
        })

        if (changed) {
          await prisma.supplierProductPriceHistory.create({
            data: {
              restaurantId: tenant.restaurantId,
              supplierProductId: updated.id,
              importBatchId: importBatch.id,
              oldPackPrice: existing.packPrice,
              newPackPrice: cleanProduct.packPrice,
              oldUnitPrice: existing.unitPrice,
              newUnitPrice: cleanProduct.unitPrice,
            },
          })

          priceChangeCount++
        }

        updatedCount++
      } else {
        await prisma.supplierProduct.create({
          data: {
            restaurantId: tenant.restaurantId,
            ...cleanProduct,
            linkedItemId: linkedItem.id,
          },
        })

        createdCount++
      }

      linkedCount++
    }

    const updatedBatch = await prisma.supplierImportBatch.update({
      where: {
        id: importBatch.id,
      },
      data: {
        createdCount,
        updatedCount,
        priceChangeCount,
      },
    })

    return NextResponse.json({
      success: true,
      importBatchId: updatedBatch.id,
      parsedCount: updatedBatch.parsedCount,
      createdCount,
      updatedCount,
      linkedCount,
      skippedCount,
      priceChangeCount,
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('POST /api/supplier-products failed:', error)
    return NextResponse.json({ error: 'Failed to save supplier products' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to update supplier products.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const id = String(body.id || '')

    if (!id) {
      return NextResponse.json({ error: 'Missing supplier product id' }, { status: 400 })
    }

    const existing = await prisma.supplierProduct.findFirst({
      where: {
        id,
        restaurantId: tenant.restaurantId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Supplier product not found' }, { status: 404 })
    }

    const updateData: any = {}

    if ('supplier' in body) updateData.supplier = String(body.supplier || '')
    if ('supplierSku' in body) {
      updateData.supplierSku = body.supplierSku ? String(body.supplierSku) : null
    }
    if ('name' in body) updateData.name = String(body.name || '')
    if ('packSize' in body) updateData.packSize = body.packSize ? String(body.packSize) : null
    if ('weight' in body) updateData.weight = body.weight ? String(body.weight) : null
    if ('packPrice' in body) updateData.packPrice = toNullableNumber(body.packPrice)
    if ('unitPrice' in body) updateData.unitPrice = toNullableNumber(body.unitPrice)

    if ('linkedItemId' in body) {
      if (body.linkedItemId) {
        const linkedItem = await prisma.item.findFirst({
          where: {
            id: String(body.linkedItemId),
            restaurantId: tenant.restaurantId,
          },
        })

        if (!linkedItem) {
          return NextResponse.json({ error: 'Linked item not found' }, { status: 404 })
        }

        updateData.linkedItemId = linkedItem.id
      } else {
        updateData.linkedItemId = null
      }
    }

    const newPackPrice =
      'packPrice' in updateData ? updateData.packPrice : existing.packPrice

    const newUnitPrice =
      'unitPrice' in updateData ? updateData.unitPrice : existing.unitPrice

    const changed = pricesChanged({
      oldPackPrice: existing.packPrice,
      newPackPrice,
      oldUnitPrice: existing.unitPrice,
      newUnitPrice,
    })

    const product = await prisma.supplierProduct.update({
      where: {
        id: existing.id,
      },
      data: updateData,
      include: {
        linkedItem: true,
      },
    })

    if (changed) {
      await prisma.supplierProductPriceHistory.create({
        data: {
          restaurantId: tenant.restaurantId,
          supplierProductId: product.id,
          oldPackPrice: existing.packPrice,
          newPackPrice,
          oldUnitPrice: existing.unitPrice,
          newUnitPrice,
        },
      })
    }

    return NextResponse.json(product)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('PATCH /api/supplier-products failed:', error)
    return NextResponse.json({ error: 'Failed to update supplier product' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to delete supplier products.' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing supplier product id' }, { status: 400 })
    }

    const existing = await prisma.supplierProduct.findFirst({
      where: {
        id,
        restaurantId: tenant.restaurantId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Supplier product not found' }, { status: 404 })
    }

    await prisma.supplierProduct.delete({
      where: {
        id: existing.id,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('DELETE /api/supplier-products failed:', error)
    return NextResponse.json({ error: 'Failed to delete supplier product' }, { status: 500 })
  }
}