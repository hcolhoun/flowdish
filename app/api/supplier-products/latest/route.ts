import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'

export async function GET(req: Request) {
  try {
    const tenant = await requireTenant()

    const { searchParams } = new URL(req.url)
    const itemId = searchParams.get('itemId')

    if (!itemId) {
      return NextResponse.json({ error: 'Missing itemId' }, { status: 400 })
    }

    const item = await prisma.item.findFirst({
      where: {
        id: itemId,
        restaurantId: tenant.restaurantId,
      },
    })

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const products = await prisma.supplierProduct.findMany({
      where: {
        restaurantId: tenant.restaurantId,
        OR: [
          { linkedItemId: item.id },
          { supplierSku: item.sku },
        ],
        unitPrice: {
          gt: 0,
        },
      },
      orderBy: [
        { unitPrice: 'asc' },
        { createdAt: 'desc' },
      ],
      take: 5,
    })

    const best = products[0] ?? null

    if (!best) {
      return NextResponse.json({
        item,
        supplierProduct: null,
      })
    }

    return NextResponse.json({
      item,
      supplierProduct: {
        id: best.id,
        supplier: best.supplier,
        supplierSku: best.supplierSku,
        name: best.name,
        packSize: best.packSize,
        weight: best.weight,
        packPrice: best.packPrice,
        unitPrice: best.unitPrice,
      },
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/supplier-products/latest failed:', error)
    return NextResponse.json(
      { error: 'Failed to load latest supplier price' },
      { status: 500 }
    )
  }
}