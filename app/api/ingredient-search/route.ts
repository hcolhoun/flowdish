import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type L3ItemWithBestPrice = {
  id: string
  sku: string
  name: string
  itemType: 'L3'
  unitType: 'g' | 'ml' | 'each'
  shelfLifeDays: number | null
  sellingPrice: number | null
  standardBatchOutput: number | null
  createdAt: Date
  bestSupplierPrice: {
    supplier: string
    supplierSku: string | null
    productName: string
    packSize: string | null
    weight: string | null
    packPrice: number | null
    unitPrice: number | null
  } | null
}

function normalise(value: string) {
  return value.trim().toLowerCase()
}

function isUsefulUnitPrice(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') || ''
    const query = q.trim()

    if (query.length < 2) {
      return NextResponse.json({
        items: [],
        supplierProducts: [],
      })
    }

    const items = await prisma.item.findMany({
      where: {
        itemType: 'L3',
        OR: [
          {
            name: {
              contains: query,
              mode: 'insensitive',
            },
          },
          {
            sku: {
              contains: query,
              mode: 'insensitive',
            },
          },
        ],
      },
      take: 20,
      orderBy: { name: 'asc' },
    })

    const itemIds = items.map((item) => item.id)
    const itemSkus = items.map((item) => item.sku).filter(Boolean)

    const linkedSupplierProducts =
      itemIds.length > 0 || itemSkus.length > 0
        ? await prisma.supplierProduct.findMany({
            where: {
              OR: [
                itemIds.length > 0
                  ? {
                      linkedItemId: {
                        in: itemIds,
                      },
                    }
                  : undefined,
                itemSkus.length > 0
                  ? {
                      supplierSku: {
                        in: itemSkus,
                      },
                    }
                  : undefined,
              ].filter(Boolean) as any,
            },
            orderBy: [
              {
                unitPrice: 'asc',
              },
              {
                name: 'asc',
              },
            ],
          })
        : []

    const productsByLinkedItemId = new Map<string, typeof linkedSupplierProducts>()
    const productsBySupplierSku = new Map<string, typeof linkedSupplierProducts>()

    for (const product of linkedSupplierProducts) {
      if (product.linkedItemId) {
        const existing = productsByLinkedItemId.get(product.linkedItemId) ?? []
        existing.push(product)
        productsByLinkedItemId.set(product.linkedItemId, existing)
      }

      if (product.supplierSku) {
        const key = normalise(product.supplierSku)
        const existing = productsBySupplierSku.get(key) ?? []
        existing.push(product)
        productsBySupplierSku.set(key, existing)
      }
    }

    const itemsWithPrices: L3ItemWithBestPrice[] = items.map((item) => {
      const linkedProducts = productsByLinkedItemId.get(item.id) ?? []
      const skuProducts = productsBySupplierSku.get(normalise(item.sku)) ?? []

      const candidates = [...linkedProducts, ...skuProducts]
        .filter((product) => isUsefulUnitPrice(product.unitPrice))
        .sort((a, b) => {
          const aPrice = a.unitPrice ?? Number.POSITIVE_INFINITY
          const bPrice = b.unitPrice ?? Number.POSITIVE_INFINITY
          return aPrice - bPrice
        })

      const best = candidates[0] ?? null

      return {
        ...item,
        itemType: 'L3',
        unitType: item.unitType,
        bestSupplierPrice: best
          ? {
              supplier: best.supplier,
              supplierSku: best.supplierSku,
              productName: best.name,
              packSize: best.packSize,
              weight: best.weight,
              packPrice: best.packPrice,
              unitPrice: best.unitPrice,
            }
          : null,
      }
    })

    const supplierProducts = await prisma.supplierProduct.findMany({
      where: {
        OR: [
          {
            name: {
              contains: query,
              mode: 'insensitive',
            },
          },
          {
            supplierSku: {
              contains: query,
              mode: 'insensitive',
            },
          },
          {
            supplier: {
              contains: query,
              mode: 'insensitive',
            },
          },
        ],
      },
      include: {
        linkedItem: true,
      },
      take: 20,
      orderBy: [
        {
          unitPrice: 'asc',
        },
        {
          name: 'asc',
        },
      ],
    })

    return NextResponse.json({
      items: itemsWithPrices,
      supplierProducts,
    })
  } catch (error) {
    console.error('GET /api/ingredient-search failed:', error)
    return NextResponse.json(
      { error: 'Ingredient search failed' },
      { status: 500 }
    )
  }
}