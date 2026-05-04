import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type BaseUnit = 'g' | 'ml' | 'each'

type CleanSupplierProduct = {
  supplier: string
  supplierSku: string | null
  name: string
  packSize: string | null
  weight: string | null
  packPrice: number | null
  unitPrice: number | null
}

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

  const matches = Array.from(
    value.matchAll(/(\d+(?:\.\d+)?\s?(?:kg|g|ml|l))\b/gi)
  )

  if (matches.length === 0) return null

  return matches[matches.length - 1][1]
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normaliseProductName(name: string, weight: string | null) {
  let cleaned = name.trim().replace(/\s+/g, ' ')

  if (weight) {
    cleaned = cleaned.replace(new RegExp(escapeRegExp(weight).replace(/\s+/g, '\\s?'), 'i'), '')
  }

  return cleaned
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

function inferUnitType(product: CleanSupplierProduct): 'g' | 'ml' | 'each' {
  const parsedWeight = parseWeightToBaseAmount(product.weight)

  if (parsedWeight?.unitType === 'g') return 'g'
  if (parsedWeight?.unitType === 'ml') return 'ml'

  const text = `${product.name || ''} ${product.packSize || ''} ${product.weight || ''}`.toLowerCase()

  if (/\d+(\.\d+)?\s?(kg|g)\b/.test(text)) return 'g'
  if (/\d+(\.\d+)?\s?(l|ml)\b/.test(text)) return 'ml'

  return 'each'
}

function inferShelfLifeDays(product: CleanSupplierProduct): number {
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

function makeSku(product: CleanSupplierProduct) {
  if (product.supplierSku) return String(product.supplierSku).trim()

  return `${product.supplier}-${product.name}`
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function createOrLinkL3(product: CleanSupplierProduct) {
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
  } else if (item.itemType === 'L3' && item.unitType !== unitType) {
    item = await prisma.item.update({
      where: { id: item.id },
      data: { unitType },
    })
  }

  return item
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null

  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function cleanRawProduct(product: any): CleanSupplierProduct | null {
  const rawName = String(product.name || '').trim()
  const inferredWeight =
    product.weight ? String(product.weight).trim() : extractWeightFromText(rawName)

  const cleanName = normaliseProductName(rawName, inferredWeight)

  const packPrice = toNullableNumber(product.packPrice)
  const parsedUnitOrKiloPrice = toNullableNumber(product.unitPrice)

  const cleanProduct: CleanSupplierProduct = {
    supplier: String(product.supplier || '').trim(),
    supplierSku: product.supplierSku ? String(product.supplierSku).trim() : null,
    name: cleanName,
    packSize: product.packSize ? String(product.packSize).trim() : null,
    weight: inferredWeight,
    packPrice,
    unitPrice: parsedUnitOrKiloPrice,
  }

  cleanProduct.unitPrice = calculateBaseUnitPrice(cleanProduct)

  if (!cleanProduct.supplier) return null
  if (!cleanProduct.name || cleanProduct.name.length < 3) return null

  return cleanProduct
}

function dedupeProducts(products: any[]) {
  const map = new Map<string, CleanSupplierProduct>()
  let duplicateInUploadCount = 0
  let skippedCount = 0

  for (const product of products) {
    const cleanProduct = cleanRawProduct(product)

    if (!cleanProduct) {
      skippedCount++
      continue
    }

    const key = cleanProduct.supplierSku
      ? `${cleanProduct.supplier.toLowerCase()}::sku::${cleanProduct.supplierSku.toLowerCase()}`
      : `${cleanProduct.supplier.toLowerCase()}::name::${cleanProduct.name.toLowerCase()}`

    const existing = map.get(key)

    if (existing) {
      duplicateInUploadCount++

      map.set(key, {
        supplier: cleanProduct.supplier || existing.supplier,
        supplierSku: cleanProduct.supplierSku || existing.supplierSku,
        name: cleanProduct.name || existing.name,
        packSize: cleanProduct.packSize || existing.packSize,
        weight: cleanProduct.weight || existing.weight,
        packPrice: cleanProduct.packPrice ?? existing.packPrice,
        unitPrice: cleanProduct.unitPrice ?? existing.unitPrice,
      })
    } else {
      map.set(key, cleanProduct)
    }
  }

  return {
    products: Array.from(map.values()),
    duplicateInUploadCount,
    skippedCount,
  }
}

async function saveSupplierProduct(cleanProduct: CleanSupplierProduct, linkedItemId: string) {
  if (cleanProduct.supplierSku) {
    const updated = await prisma.supplierProduct.updateMany({
      where: {
        supplier: cleanProduct.supplier,
        supplierSku: cleanProduct.supplierSku,
      },
      data: {
        ...cleanProduct,
        linkedItemId,
      },
    })

    if (updated.count > 0) {
      return 'updated' as const
    }

    try {
      await prisma.supplierProduct.create({
        data: {
          ...cleanProduct,
          linkedItemId,
        },
      })

      return 'created' as const
    } catch (error) {
      if ((error as any)?.code === 'P2002') {
        await prisma.supplierProduct.updateMany({
          where: {
            supplier: cleanProduct.supplier,
            supplierSku: cleanProduct.supplierSku,
          },
          data: {
            ...cleanProduct,
            linkedItemId,
          },
        })

        return 'updated' as const
      }

      throw error
    }
  }

  const existing = await prisma.supplierProduct.findFirst({
    where: {
      supplier: cleanProduct.supplier,
      supplierSku: null,
      name: cleanProduct.name,
    },
    orderBy: { createdAt: 'asc' },
  })

  if (existing) {
    await prisma.supplierProduct.update({
      where: { id: existing.id },
      data: {
        ...cleanProduct,
        linkedItemId,
      },
    })

    return 'updated' as const
  }

  await prisma.supplierProduct.create({
    data: {
      ...cleanProduct,
      linkedItemId,
    },
  })

  return 'created' as const
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
    const rawProducts = body.products

    if (!Array.isArray(rawProducts)) {
      return NextResponse.json({ error: 'Products must be an array' }, { status: 400 })
    }

    const {
      products,
      duplicateInUploadCount,
      skippedCount: skippedDuringClean,
    } = dedupeProducts(rawProducts)

    let createdCount = 0
    let updatedCount = 0
    let linkedCount = 0
    let skippedCount = skippedDuringClean

    for (const cleanProduct of products) {
      try {
        const linkedItem = await createOrLinkL3(cleanProduct)
        const result = await saveSupplierProduct(cleanProduct, linkedItem.id)

        if (result === 'created') createdCount++
        if (result === 'updated') updatedCount++

        linkedCount++
      } catch (error) {
        console.error('Failed to save individual supplier product:', cleanProduct, error)
        skippedCount++
      }
    }

    return NextResponse.json({
      success: true,
      createdCount,
      updatedCount,
      linkedCount,
      skippedCount,
      duplicateInUploadCount,
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