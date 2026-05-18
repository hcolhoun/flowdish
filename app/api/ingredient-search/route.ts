import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'

function containsInsensitive(value: string) {
  return {
    contains: value,
    mode: 'insensitive' as const,
  }
}

export async function GET(req: Request) {
  try {
    const tenant = await requireTenant()

    const { searchParams } = new URL(req.url)
    const q = String(searchParams.get('q') || '').trim()

    if (q.length < 2) {
      return NextResponse.json({
        items: [],
        supplierProducts: [],
      })
    }

    const [items, supplierProducts] = await Promise.all([
      prisma.item.findMany({
        where: {
          restaurantId: tenant.restaurantId,
          itemType: 'L3',
          OR: [
            { name: containsInsensitive(q) },
            { sku: containsInsensitive(q) },
          ],
        },
        include: {
          supplierProducts: {
            where: {
              restaurantId: tenant.restaurantId,
              unitPrice: {
                gt: 0,
              },
            },
            orderBy: [
              { unitPrice: 'asc' },
              { createdAt: 'desc' },
            ],
            take: 1,
          },
        },
        orderBy: {
          name: 'asc',
        },
        take: 20,
      }),

      prisma.supplierProduct.findMany({
        where: {
          restaurantId: tenant.restaurantId,
          OR: [
            { name: containsInsensitive(q) },
            { supplierSku: containsInsensitive(q) },
            { supplier: containsInsensitive(q) },
          ],
        },
        include: {
          linkedItem: true,
        },
        orderBy: [
          { unitPrice: 'asc' },
          { name: 'asc' },
        ],
        take: 20,
      }),
    ])

    const itemsWithBestSupplierPrice = items.map((item) => {
      const best = item.supplierProducts[0] ?? null

      return {
        ...item,
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

    return NextResponse.json({
      items: itemsWithBestSupplierPrice,
      supplierProducts,
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/ingredient-search failed:', error)
    return NextResponse.json({ error: 'Failed to search ingredients' }, { status: 500 })
  }
}