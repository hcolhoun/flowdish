import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'

export async function GET() {
  try {
    const tenant = await requireTenant()

    const lots = await prisma.inventoryLot.findMany({
      where: {
        restaurantId: tenant.restaurantId,
        qtyRemaining: {
          gt: 0,
        },
      },
      include: {
        item: true,
        delivery: true,
      },
      orderBy: [
        { expiryAt: 'asc' },
        { createdAt: 'asc' },
      ],
    })

    const rows = lots.map((lot) => ({
      id: lot.id,
      itemId: lot.itemId,
      sku: lot.item.sku,
      name: lot.item.name,
      unitType: lot.unitType,
      qtyInitial: lot.qtyInitial,
      qtyRemaining: lot.qtyRemaining,
      expiryAt: lot.expiryAt,
      sourceType: lot.sourceType,
      unitCost: lot.unitCost,
      createdAt: lot.createdAt,
      deliveryId: lot.deliveryId,
      delivery: lot.delivery
        ? {
            id: lot.delivery.id,
            deliveredAt: lot.delivery.deliveredAt,
            supplier: lot.delivery.supplier,
            price: lot.delivery.price,
          }
        : null,
    }))

    return NextResponse.json(rows)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/inventory failed:', error)
    return NextResponse.json({ error: 'Failed to load inventory' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to delete inventory.' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing inventory lot id' }, { status: 400 })
    }

    const lot = await prisma.inventoryLot.findFirst({
      where: {
        id,
        restaurantId: tenant.restaurantId,
      },
      include: {
        item: true,
      },
    })

    if (!lot) {
      return NextResponse.json({ error: 'Inventory lot not found' }, { status: 404 })
    }

    if (lot.qtyRemaining !== lot.qtyInitial) {
      return NextResponse.json(
        { error: 'Cannot delete this inventory lot because some stock has already been used.' },
        { status: 400 }
      )
    }

    await prisma.inventoryLot.delete({
      where: {
        id: lot.id,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('DELETE /api/inventory failed:', error)
    return NextResponse.json({ error: 'Failed to delete inventory lot' }, { status: 500 })
  }
}