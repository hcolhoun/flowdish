import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'

type InventoryLotForDelete = {
  id: string
  itemId: string
  qtyInitial: number
  qtyRemaining: number
  expiryAt: Date | null
}

function actorFieldsFromTenant(tenant: Awaited<ReturnType<typeof requireTenant>>) {
  return {
    enteredByType: tenant.role,
    enteredByName: tenant.email || 'Chef',
    enteredByEmail: tenant.email,
    enteredByAuthUserId: tenant.authUserId,
    enteredByStaffUserId: null,
  }
}

function sameDate(a: Date | null, b: Date | null) {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.getTime() === b.getTime()
}

export async function GET() {
  try {
    const tenant = await requireTenant()

    const deliveries = await prisma.delivery.findMany({
      where: {
        restaurantId: tenant.restaurantId,
      },
      include: {
        item: true,
      },
      orderBy: { deliveredAt: 'desc' },
    })

    return NextResponse.json(deliveries)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/deliveries failed:', error)
    return NextResponse.json({ error: 'Failed to load deliveries' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to create deliveries.' },
        { status: 403 }
      )
    }

    const body = await req.json()

    const item = await prisma.item.findFirst({
      where: {
        id: body.itemId,
        restaurantId: tenant.restaurantId,
      },
    })

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    if (item.itemType !== 'L3') {
      return NextResponse.json(
        { error: 'Deliveries can only be created for L3 items' },
        { status: 400 }
      )
    }

    const deliveredAt = new Date(body.deliveredAt)
    const qty = Number(body.qty)
    const totalCost = Number(body.totalCost)

    if (Number.isNaN(deliveredAt.getTime())) {
      return NextResponse.json({ error: 'Valid delivery date is required' }, { status: 400 })
    }

    if (!qty || qty <= 0 || Number.isNaN(qty)) {
      return NextResponse.json({ error: 'Quantity must be greater than 0' }, { status: 400 })
    }

    if (!totalCost || totalCost <= 0 || Number.isNaN(totalCost)) {
      return NextResponse.json(
        { error: 'Total delivery cost must be greater than 0' },
        { status: 400 }
      )
    }

    const unitCost = totalCost / qty

    const expiryAt =
      body.expiryAt !== undefined && body.expiryAt !== null && body.expiryAt !== ''
        ? new Date(body.expiryAt)
        : item.shelfLifeDays != null
          ? new Date(deliveredAt.getTime() + item.shelfLifeDays * 24 * 60 * 60 * 1000)
          : null

    if (expiryAt && Number.isNaN(expiryAt.getTime())) {
      return NextResponse.json({ error: 'Valid expiry date is required' }, { status: 400 })
    }

    const delivery = await prisma.$transaction(async (tx: any) => {
      const createdDelivery = await tx.delivery.create({
        data: {
          restaurantId: tenant.restaurantId,
          deliveredAt,
          itemId: item.id,
          qty,
          unitType: item.unitType,
          supplier: body.supplier || null,
          price: totalCost,
          expiryAt,
          ...actorFieldsFromTenant(tenant),
        },
        include: { item: true },
      })

      await tx.inventoryLot.create({
        data: {
          restaurantId: tenant.restaurantId,
          itemId: item.id,
          qtyInitial: qty,
          qtyRemaining: qty,
          unitType: item.unitType,
          expiryAt,
          sourceType: 'DELIVERY',
          unitCost,
          deliveryId: createdDelivery.id,
        },
      })

      return createdDelivery
    })

    return NextResponse.json(delivery)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('POST /api/deliveries failed:', error)
    return NextResponse.json({ error: 'Failed to save delivery' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to delete deliveries.' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing delivery id' }, { status: 400 })
    }

    const delivery = await prisma.delivery.findFirst({
      where: {
        id,
        restaurantId: tenant.restaurantId,
      },
    })

    if (!delivery) {
      return NextResponse.json({ error: 'Delivery not found' }, { status: 404 })
    }

    let lotsToDelete = (await prisma.inventoryLot.findMany({
      where: {
        restaurantId: tenant.restaurantId,
        deliveryId: delivery.id,
      },
      orderBy: { createdAt: 'asc' },
    })) as InventoryLotForDelete[]

    if (lotsToDelete.length === 0) {
      const fallbackLots = (await prisma.inventoryLot.findMany({
        where: {
          restaurantId: tenant.restaurantId,
          itemId: delivery.itemId,
          sourceType: 'DELIVERY',
          qtyInitial: delivery.qty,
        },
        orderBy: { createdAt: 'asc' },
      })) as InventoryLotForDelete[]

      lotsToDelete = fallbackLots.filter((lot: InventoryLotForDelete) =>
        sameDate(lot.expiryAt, delivery.expiryAt)
      )
    }

    for (const lot of lotsToDelete) {
      if (lot.qtyRemaining !== lot.qtyInitial) {
        return NextResponse.json(
          { error: 'Cannot delete delivery because some of its stock has already been used.' },
          { status: 400 }
        )
      }
    }

    await prisma.$transaction(async (tx: any) => {
      if (lotsToDelete.length > 0) {
        await tx.inventoryLot.deleteMany({
          where: {
            restaurantId: tenant.restaurantId,
            id: {
              in: lotsToDelete.map((lot) => lot.id),
            },
          },
        })
      }

      await tx.delivery.delete({
        where: { id: delivery.id },
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('DELETE /api/deliveries failed:', error)
    return NextResponse.json({ error: 'Failed to delete delivery' }, { status: 500 })
  }
}