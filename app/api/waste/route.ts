import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'

async function ensureEnoughStock({
  restaurantId,
  itemId,
  qty,
}: {
  restaurantId: string
  itemId: string
  qty: number
}) {
  const lots = await prisma.inventoryLot.findMany({
    where: {
      restaurantId,
      itemId,
      qtyRemaining: { gt: 0 },
    },
  })

  const availableQty = lots.reduce((sum, lot) => sum + lot.qtyRemaining, 0)

  return availableQty >= qty
}

async function consumeInventoryFifo({
  tx,
  restaurantId,
  itemId,
  qty,
}: {
  tx: any
  restaurantId: string
  itemId: string
  qty: number
}) {
  let qtyNeeded = qty
  let totalCost = 0

  const lots = await tx.inventoryLot.findMany({
    where: {
      restaurantId,
      itemId,
      qtyRemaining: { gt: 0 },
    },
    orderBy: [
      { expiryAt: 'asc' },
      { createdAt: 'asc' },
    ],
  })

  for (const lot of lots) {
    if (qtyNeeded <= 0) break

    const takeQty = Math.min(lot.qtyRemaining, qtyNeeded)

    totalCost += takeQty * (lot.unitCost ?? 0)

    await tx.inventoryLot.update({
      where: { id: lot.id },
      data: {
        qtyRemaining: lot.qtyRemaining - takeQty,
      },
    })

    qtyNeeded -= takeQty
  }

  if (qtyNeeded > 0) {
    throw new Error('NOT_ENOUGH_STOCK')
  }

  return totalCost
}

export async function GET() {
  try {
    const tenant = await requireTenant()

    const wastes = await prisma.waste.findMany({
      where: {
        restaurantId: tenant.restaurantId,
      },
      include: { item: true },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(wastes)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/waste failed:', error)
    return NextResponse.json({ error: 'Failed to load waste records' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to record waste.' },
        { status: 403 }
      )
    }

    const body = await req.json()

    const itemId = String(body.itemId || '')
    const date = new Date(body.date)
    const qty = Number(body.qty)
    const reason = body.reason ? String(body.reason).trim() : null

    if (!itemId) {
      return NextResponse.json({ error: 'Missing item' }, { status: 400 })
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

    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Invalid waste date' }, { status: 400 })
    }

    if (!qty || qty <= 0 || Number.isNaN(qty)) {
      return NextResponse.json({ error: 'Quantity must be greater than 0' }, { status: 400 })
    }

    const enough = await ensureEnoughStock({
      restaurantId: tenant.restaurantId,
      itemId: item.id,
      qty,
    })

    if (!enough) {
      return NextResponse.json(
        { error: `Insufficient stock for ${item.name} [${item.sku}]` },
        { status: 400 }
      )
    }

    const waste = await prisma.$transaction(async (tx: any) => {
      await consumeInventoryFifo({
        tx,
        restaurantId: tenant.restaurantId,
        itemId: item.id,
        qty,
      })

      return tx.waste.create({
        data: {
          restaurantId: tenant.restaurantId,
          date,
          itemId: item.id,
          qty,
          reason,
        },
        include: { item: true },
      })
    })

    return NextResponse.json(waste)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    if (error instanceof Error && error.message === 'NOT_ENOUGH_STOCK') {
      return NextResponse.json({ error: 'Insufficient stock for waste record.' }, { status: 400 })
    }

    console.error('POST /api/waste failed:', error)
    return NextResponse.json({ error: 'Failed to save waste record' }, { status: 500 })
  }
}