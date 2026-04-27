import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { addInventoryLot } from '@/lib/inventory'
import { InventorySourceType } from '@prisma/client'

export async function GET() {
  const deliveries = await prisma.delivery.findMany({
    include: { item: true },
    orderBy: { deliveredAt: 'desc' },
  })

  return NextResponse.json(deliveries)
}

export async function POST(req: Request) {
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
  const expiryAt =
    item.shelfLifeDays != null
      ? new Date(deliveredAt.getTime() + item.shelfLifeDays * 24 * 60 * 60 * 1000)
      : null

  const delivery = await prisma.delivery.create({
    data: {
      deliveredAt,
      itemId: body.itemId,
      qty: Number(body.qty),
      unitType: item.unitType,
      supplier: body.supplier || null,
      price: body.price ? Number(body.price) : null,
      expiryAt,
    },
  })

 await prisma.inventoryLot.create({
  data: {
    itemId: delivery.itemId,
    qtyInitial: delivery.qty,
    qtyRemaining: delivery.qty,
    unitType: delivery.unitType,
    expiryAt: delivery.expiryAt,
    sourceType: 'DELIVERY',
    unitCost: delivery.price ?? 0,
  },
})

  return NextResponse.json(delivery)
}