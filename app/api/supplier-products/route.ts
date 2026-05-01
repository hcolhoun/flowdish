import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function inferUnitType(product: any): 'g' | 'ml' | 'each' {
  const text = `${product.name || ''} ${product.packSize || ''} ${product.weight || ''}`.toLowerCase()

  if (/\d+(\.\d+)?\s?(kg|g)\b/.test(text)) return 'g'
  if (/\d+(\.\d+)?\s?(l|ml)\b/.test(text)) return 'ml'

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
    let linkedCount = 0

    for (const product of products as any[]) {
      const cleanProduct = {
        supplier: String(product.supplier || ''),
        supplierSku: product.supplierSku ? String(product.supplierSku) : null,
        name: String(product.name || ''),
        packSize: product.packSize ? String(product.packSize) : null,
        weight: product.weight ? String(product.weight) : null,
        packPrice:
          product.packPrice === null || product.packPrice === undefined || product.packPrice === ''
            ? null
            : Number(product.packPrice),
        unitPrice:
          product.unitPrice === null || product.unitPrice === undefined || product.unitPrice === ''
            ? null
            : Number(product.unitPrice),
      }

      if (!cleanProduct.name) continue

      const linkedItem = await createOrLinkL3(cleanProduct)

      const existing = await prisma.supplierProduct.findFirst({
        where: {
          supplier: cleanProduct.supplier,
          supplierSku: cleanProduct.supplierSku,
          name: cleanProduct.name,
        },
      })

      if (existing) {
        await prisma.supplierProduct.update({
          where: { id: existing.id },
          data: {
            ...cleanProduct,
            linkedItemId: linkedItem.id,
          },
        })
      } else {
        await prisma.supplierProduct.create({
          data: {
            ...cleanProduct,
            linkedItemId: linkedItem.id,
          },
        })
        createdCount++
      }

      linkedCount++
    }

    return NextResponse.json({
      success: true,
      createdCount,
      linkedCount,
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