import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function inferUnitType(product: any): 'g' | 'ml' | 'each' {
  const basis = String(product.priceBasis || '').toLowerCase()
  const text = `${product.name || ''} ${product.packSize || ''} ${product.weight || ''}`.toLowerCase()

  if (basis === 'g') return 'g'
  if (basis === 'ml') return 'ml'
  if (basis === 'each') return 'each'

  if (/\d+(\.\d+)?\s?(kg|g)\b/.test(text)) return 'g'
  if (/\d+(\.\d+)?\s?(l|ltr|litre|liter|ml)\b/.test(text)) return 'ml'

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

function cleanString(value: unknown) {
  const text = String(value || '').trim()
  return text.length > 0 ? text : null
}

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function isBadAutoItemName(name: string) {
  if (!name || name.trim().length < 3) return true
  if (/^boxx?$/i.test(name)) return true
  if (/^bagx?$/i.test(name)) return true
  if (/^packx?$/i.test(name)) return true
  if (/Product Price List/i.test(name)) return true
  if (/OrderProduct Code/i.test(name)) return true
  if (/Further Information/i.test(name)) return true
  return false
}

async function createOrLinkL3(product: any) {
  const sku = makeSku(product)
  const unitType = inferUnitType(product)
  const shelfLifeDays = inferShelfLifeDays(product)

  if (!sku) return null
  if (isBadAutoItemName(product.name)) return null

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
      },
    })
  }

  return item
}

function dedupeIncomingProducts(products: any[]) {
  const map = new Map<string, any>()

  for (const product of products) {
    const supplier = String(product.supplier || '').trim()
    const supplierSku = product.supplierSku ? String(product.supplierSku).trim() : ''
    const name = String(product.name || '').trim()

    if (!supplier || !name) continue

    const key = supplierSku
      ? `${supplier}:${supplierSku}`
      : `${supplier}:${name.toLowerCase()}`

    map.set(key, product)
  }

  return Array.from(map.values())
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
    const products = Array.isArray(body.products) ? body.products : []

    if (!Array.isArray(products)) {
      return NextResponse.json({ error: 'Products must be an array' }, { status: 400 })
    }

    const dedupedProducts = dedupeIncomingProducts(products)

    let createdCount = 0
    let updatedCount = 0
    let linkedCount = 0
    let skippedCount = 0

    for (const product of dedupedProducts) {
      const cleanProduct = {
        supplier: String(product.supplier || '').trim(),
        supplierSku: cleanString(product.supplierSku),
        name: String(product.name || '').trim(),
        packSize: cleanString(product.packSize),
        weight: cleanString(product.weight),
        packPrice: cleanNumber(product.packPrice),
        unitPrice: cleanNumber(product.unitPrice),
      }

      if (!cleanProduct.supplier || !cleanProduct.name) {
        skippedCount++
        continue
      }

      if (isBadAutoItemName(cleanProduct.name)) {
        skippedCount++
        continue
      }

      const linkedItem = await createOrLinkL3({
        ...cleanProduct,
        priceBasis: product.priceBasis,
      })

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
              name: cleanProduct.name,
            },
          })

      if (existing) {
        await prisma.supplierProduct.update({
          where: { id: existing.id },
          data: {
            ...cleanProduct,
            linkedItemId: linkedItem?.id ?? existing.linkedItemId,
          },
        })

        updatedCount++
      } else {
        await prisma.supplierProduct.create({
          data: {
            ...cleanProduct,
            linkedItemId: linkedItem?.id ?? null,
          },
        })

        createdCount++
      }

      if (linkedItem) linkedCount++
    }

    return NextResponse.json({
      success: true,
      receivedCount: products.length,
      dedupedCount: dedupedProducts.length,
      createdCount,
      updatedCount,
      linkedCount,
      skippedCount,
    })
  } catch (error: any) {
    console.error('POST /api/supplier-products failed:', error)

    if (error?.code === 'P2002') {
      return NextResponse.json(
        {
          error:
            'Duplicate supplier SKU found. The import was stopped before all rows could be saved.',
        },
        { status: 400 }
      )
    }

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
    if ('packPrice' in body) {
      updateData.packPrice =
        body.packPrice === null || body.packPrice === undefined || body.packPrice === ''
          ? null
          : Number(body.packPrice)
    }
    if ('unitPrice' in body) {
      updateData.unitPrice =
        body.unitPrice === null || body.unitPrice === undefined || body.unitPrice === ''
          ? null
          : Number(body.unitPrice)
    }

    // Important:
    // Only change linkedItemId if the frontend explicitly sends linkedItemId.
    // Do NOT default it to null, or product edits will unlink the L3.
    if ('linkedItemId' in body) {
      updateData.linkedItemId = body.linkedItemId ? String(body.linkedItemId) : null
    }

    const product = await prisma.supplierProduct.update({
      where: { id },
      data: updateData,
      include: { linkedItem: true },
    })

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

    const product = await prisma.supplierProduct.findUnique({
      where: { id },
    })

    if (!product) {
      return NextResponse.json({ error: 'Supplier product not found' }, { status: 404 })
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