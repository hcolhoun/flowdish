import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function inferUnitType(product: any): 'g' | 'ml' | 'each' {
  const text = `${product.name || ''} ${product.packSize || ''} ${product.weight || ''}`.toLowerCase()

  if (/\d+(\.\d+)?\s?(kg|g)\b/.test(text)) return 'g'
  if (/\d+(\.\d+)?\s?(l|ltr|litre|ml)\b/.test(text)) return 'ml'

  return 'each'
}

function inferShelfLifeDays(product: any): number {
  const text = `${product.name || ''} ${product.packSize || ''} ${product.weight || ''}`.toLowerCase()

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

async function createOrLinkL3(product: any) {
  const sku = makeSku(product)
  const unitType = inferUnitType(product)
  const shelfLifeDays = inferShelfLifeDays(product)

  let item = await prisma.item.findUnique({
    where: { sku },
  })

  if (!item) {
    item = await prisma.item.create({
      data: {
        sku,
        name: product.name,
        itemType: 'L3',
        unitType,
        shelfLifeDays,
        sellingPrice: null,
        standardBatchOutput: null,
        buildStatus: 'BUILT',
      } as any,
    })
  } else if (item.itemType === 'L3' && item.unitType !== unitType) {
    item = await prisma.item.update({
      where: { id: item.id },
      data: { unitType },
    })
  }

  return item
}

export async function GET() {
  try {
    const products = await prisma.supplierProduct.findMany({
      include: { linkedItem: true },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(products)
  } catch (error) {
    console.error('GET /api/supplier-products failed:', error)
    return NextResponse.json(
      { error: 'Failed to load supplier products' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const products = body.products
    const fileName = body.fileName ? String(body.fileName) : null
    const supplierName = body.supplier ? String(body.supplier) : 'Mixed'
    const createLinkedL3 = body.createLinkedL3 === false ? false : true

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
        supplier: supplierName,
        fileName,
        parsedCount: deduped.size,
      },
    })

    let createdCount = 0
    let updatedCount = 0
    let linkedCount = 0
    let priceChangeCount = 0

    for (const product of deduped.values()) {
      const cleanProduct = {
        supplier: String(product.supplier || supplierName || '').trim(),
        supplierSku: product.supplierSku ? String(product.supplierSku).trim() : null,
        name: String(product.name || '').trim(),
        packSize: product.packSize ? String(product.packSize).trim() : null,
        weight: product.weight ? String(product.weight).trim() : null,
        packPrice: toNullableNumber(product.packPrice),
        unitPrice: toNullableNumber(product.unitPrice),
      }

      if (!cleanProduct.supplier || !cleanProduct.name) continue

      const linkedItem =
        product.linkedItemId
          ? await prisma.item.findUnique({ where: { id: String(product.linkedItemId) } })
          : createLinkedL3
            ? await createOrLinkL3(cleanProduct)
            : null

      const existing = cleanProduct.supplierSku
        ? await prisma.supplierProduct.findFirst({
            where: {
              supplier: cleanProduct.supplier,
              supplierSku: cleanProduct.supplierSku,
            },
          })
        : await prisma.supplierProduct.findFirst({
            where: {
              supplier: cleanProduct.supplier,
              supplierSku: null,
              name: cleanProduct.name,
            },
          })

      if (existing) {
        const changed = pricesChanged({
          oldPackPrice: existing.packPrice,
          newPackPrice: cleanProduct.packPrice,
          oldUnitPrice: existing.unitPrice,
          newUnitPrice: cleanProduct.unitPrice,
        })

        const updated = await prisma.supplierProduct.update({
          where: { id: existing.id },
          data: {
            ...cleanProduct,
            linkedItemId: existing.linkedItemId || linkedItem?.id || null,
          },
        })

        if (changed) {
          await prisma.supplierProductPriceHistory.create({
            data: {
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
            ...cleanProduct,
            linkedItemId: linkedItem?.id || null,
          },
        })

        createdCount++
      }

      if (linkedItem?.id) linkedCount++
    }

    const updatedBatch = await prisma.supplierImportBatch.update({
      where: { id: importBatch.id },
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
      priceChangeCount,
    })
  } catch (error) {
    console.error('POST /api/supplier-products failed:', error)
    return NextResponse.json(
      { error: 'Failed to save supplier products' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()

    const id = String(body.id || '')

    if (!id) {
      return NextResponse.json({ error: 'Missing supplier product id' }, { status: 400 })
    }

    const existing = await prisma.supplierProduct.findUnique({
      where: { id },
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
      updateData.linkedItemId = body.linkedItemId ? String(body.linkedItemId) : null
    }

    const changed =
      'packPrice' in updateData || 'unitPrice' in updateData
        ? pricesChanged({
            oldPackPrice: existing.packPrice,
            newPackPrice:
              'packPrice' in updateData ? updateData.packPrice : existing.packPrice,
            oldUnitPrice: existing.unitPrice,
            newUnitPrice:
              'unitPrice' in updateData ? updateData.unitPrice : existing.unitPrice,
          })
        : false

    const product = await prisma.supplierProduct.update({
      where: { id },
      data: updateData,
      include: { linkedItem: true },
    })

    if (changed) {
      await prisma.supplierProductPriceHistory.create({
        data: {
          supplierProductId: product.id,
          oldPackPrice: existing.packPrice,
          newPackPrice: product.packPrice,
          oldUnitPrice: existing.unitPrice,
          newUnitPrice: product.unitPrice,
        },
      })
    }

    return NextResponse.json(product)
  } catch (error) {
    console.error('PATCH /api/supplier-products failed:', error)
    return NextResponse.json(
      { error: 'Failed to update supplier product' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing supplier product id' }, { status: 400 })
    }

    await prisma.supplierProduct.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/supplier-products failed:', error)
    return NextResponse.json(
      { error: 'Failed to delete supplier product' },
      { status: 500 }
    )
  }
}