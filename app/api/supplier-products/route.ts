import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function inferUnitType(product: any): 'g' | 'ml' | 'each' {
  const text = `${product.name || ''} ${product.packSize || ''} ${product.weight || ''}`.toLowerCase()

  if (/\d+(\.\d+)?\s?(kg|g)\b/.test(text)) return 'g'
  if (/\d+(\.\d+)?\s?(l|ltr|litre|litres|ml)\b/.test(text)) return 'ml'

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

function looksLikeBadImportedName(name: string) {
  const cleaned = name.trim().toLowerCase()

  if (!cleaned) return true
  if (cleaned.length < 3) return true

  const badExact = new Set([
    'box',
    'boxx',
    'bag',
    'bagx',
    'pack',
    'packx',
    'carton',
    'cartonx',
    'tray',
    'trayx',
    'unit',
    'bunch',
    'net',
  ])

  if (badExact.has(cleaned)) return true

  if (/^(box|bag|pack|carton|tray|unit|bunch|net)x?\d*$/i.test(name)) return true

  if (
    /product price list|orderproduct code|packsize|buyer at tenjim|caterway|please contact the sales office/i.test(
      name
    )
  ) {
    return true
  }

  return false
}

async function createOrLinkL3(product: any) {
  const sku = makeSku(product)
  const unitType = inferUnitType(product)
  const shelfLifeDays = inferShelfLifeDays(product)

  if (looksLikeBadImportedName(product.name)) {
    return null
  }

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
  } else {
    item = await prisma.item.update({
      where: { id: item.id },
      data: {
        name: product.name,
        unitType: item.itemType === 'L3' ? unitType : item.unitType,
        shelfLifeDays: item.itemType === 'L3' ? shelfLifeDays : item.shelfLifeDays,
      },
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

    if (!Array.isArray(products)) {
      return NextResponse.json({ error: 'Products must be an array' }, { status: 400 })
    }

    let createdCount = 0
    let updatedCount = 0
    let linkedCount = 0
    let skippedCount = 0

    const seen = new Set<string>()

    for (const product of products as any[]) {
      const cleanProduct = {
        supplier: String(product.supplier || 'Caterway').trim(),
        supplierSku: product.supplierSku ? String(product.supplierSku).trim() : null,
        name: String(product.name || '').trim(),
        packSize: product.packSize ? String(product.packSize).trim() : null,
        weight: product.weight ? String(product.weight).trim() : null,
        packPrice:
          product.packPrice === null ||
          product.packPrice === undefined ||
          product.packPrice === ''
            ? null
            : Number(product.packPrice),
        unitPrice:
          product.unitPrice === null ||
          product.unitPrice === undefined ||
          product.unitPrice === ''
            ? null
            : Number(product.unitPrice),
      }

      if (!cleanProduct.name || looksLikeBadImportedName(cleanProduct.name)) {
        skippedCount++
        continue
      }

      if (!cleanProduct.supplier || !cleanProduct.supplierSku) {
        skippedCount++
        continue
      }

      if (cleanProduct.packPrice !== null && Number.isNaN(cleanProduct.packPrice)) {
        skippedCount++
        continue
      }

      if (cleanProduct.unitPrice !== null && Number.isNaN(cleanProduct.unitPrice)) {
        cleanProduct.unitPrice = null
      }

      const dedupeKey = `${cleanProduct.supplier}::${cleanProduct.supplierSku}`

      if (seen.has(dedupeKey)) {
        skippedCount++
        continue
      }

      seen.add(dedupeKey)

      const linkedItem = await createOrLinkL3(cleanProduct)

      const existing = await prisma.supplierProduct.findFirst({
        where: {
          supplier: cleanProduct.supplier,
          supplierSku: cleanProduct.supplierSku,
        },
      })

      if (existing) {
        await prisma.supplierProduct.update({
          where: { id: existing.id },
          data: {
            supplier: cleanProduct.supplier,
            supplierSku: cleanProduct.supplierSku,
            name: cleanProduct.name,
            packSize: cleanProduct.packSize,
            weight: cleanProduct.weight,
            packPrice: cleanProduct.packPrice,
            unitPrice: cleanProduct.unitPrice,
            linkedItemId: linkedItem?.id ?? existing.linkedItemId,
          },
        })

        updatedCount++
      } else {
        await prisma.supplierProduct.create({
          data: {
            supplier: cleanProduct.supplier,
            supplierSku: cleanProduct.supplierSku,
            name: cleanProduct.name,
            packSize: cleanProduct.packSize,
            weight: cleanProduct.weight,
            packPrice: cleanProduct.packPrice,
            unitPrice: cleanProduct.unitPrice,
            linkedItemId: linkedItem?.id ?? null,
          },
        })

        createdCount++
      }

      if (linkedItem) linkedCount++
    }

    return NextResponse.json({
      success: true,
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
            'A duplicate supplier SKU already exists. The import was stopped before completion.',
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
    const linkedItemId = body.linkedItemId ? String(body.linkedItemId) : null

    if (!id) {
      return NextResponse.json({ error: 'Missing supplier product id' }, { status: 400 })
    }

    const product = await prisma.supplierProduct.update({
      where: { id },
      data: { linkedItemId },
      include: { linkedItem: true },
    })

    return NextResponse.json(product)
  } catch (error) {
    console.error('PATCH /api/supplier-products failed:', error)
    return NextResponse.json(
      { error: 'Failed to update supplier product link' },
      { status: 500 }
    )
  }
}