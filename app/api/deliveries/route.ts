import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type InventoryLotForDelete = {
  id: string
  itemId: string
  qtyInitial: number
  qtyRemaining: number
  expiryAt: Date | null
}

function sameDate(a: Date | null, b: Date | null) {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.getTime() === b.getTime()
}

export async function GET() {
  try {
    const deliveries = await prisma.delivery.findMany({
      include: {
        item: true,
      },
      orderBy: { deliveredAt: 'desc' },
    })

    return NextResponse.json(deliveries)
  } catch (error) {
    console.error('GET /api/deliveries failed:', error)
    return NextResponse.json({ error: 'Failed to load deliveries' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const item = await prisma.item.findUnique({
      where: { id: body.itemId },
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
      item.shelfLifeDays != null
        ? new Date(deliveredAt.getTime() + item.shelfLifeDays * 24 * 60 * 60 * 1000)
        : null

    const delivery = await prisma.$transaction(async (tx) => {
      const createdDelivery = await tx.delivery.create({
        data: {
          deliveredAt,
          itemId: item.id,
          qty,
          unitType: item.unitType,
          supplier: body.supplier || null,
          price: totalCost,
          expiryAt,
        },
        include: { item: true },
      })

      await tx.inventoryLot.create({
        data: {
          itemId: item.id,
          qtyInitial: qty,
          qtyRemaining: qty,
          unitType: item.unitType,
          expiryAt,
          sourceType: 'DELIVERY',
          unitCost,
          deliveryId: createdDelivery.id,
        } as any,
      })

      return createdDelivery
    })

    return NextResponse.json(delivery)
  } catch (error) {
    console.error('POST /api/deliveries failed:', error)
    return NextResponse.json({ error: 'Failed to save delivery' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing delivery id' }, { status: 400 })
    }

    const delivery = await prisma.delivery.findUnique({
      where: { id },
    })

    if (!delivery) {
      return NextResponse.json({ error: 'Delivery not found' }, { status: 404 })
    }

    let lotsToDelete = (await prisma.inventoryLot.findMany({
      where: {
        deliveryId: delivery.id,
      } as any,
      orderBy: { createdAt: 'asc' },
    })) as InventoryLotForDelete[]

    if (lotsToDelete.length === 0) {
      const fallbackLots = (await prisma.inventoryLot.findMany({
        where: {
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

    await prisma.$transaction(async (tx) => {
      if (lotsToDelete.length > 0) {
        await tx.inventoryLot.deleteMany({
          where: {
            id: {
              in: lotsToDelete.map((lot) => lot.id),
            },
          },
        })
      }

      await tx.delivery.delete({
        where: { id },
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/deliveries failed:', error)
    return NextResponse.json({ error: 'Failed to delete delivery' }, { status: 500 })
  }
}