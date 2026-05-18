import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'

export async function GET() {
  try {
    const tenant = await requireTenant()

    const sales = await prisma.sale.findMany({
      where: {
        restaurantId: tenant.restaurantId,
      },
      include: { item: true },
      orderBy: { soldAt: 'desc' },
    })

    return NextResponse.json(sales)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/sales failed:', error)
    return NextResponse.json({ error: 'Failed to load sales' }, { status: 500 })
  }
}

async function consumeInventoryForItem({
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
  let totalCost = 0
  let qtyNeeded = qty

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

async function calculateAndConsumeL1Sale({
  tx,
  restaurantId,
  l1ItemId,
  qtySold,
}: {
  tx: any
  restaurantId: string
  l1ItemId: string
  qtySold: number
}) {
  let totalCost = 0

  const [l1ToL2Rows, l1ToL3Rows] = await Promise.all([
    tx.bomL1L2.findMany({
      where: {
        restaurantId,
        l1ItemId,
      },
      include: {
        l2: true,
      },
    }),

    tx.bomL1L3.findMany({
      where: {
        restaurantId,
        l1ItemId,
      },
      include: {
        l3: true,
      },
    }),
  ])

  if (l1ToL2Rows.length === 0 && l1ToL3Rows.length === 0) {
    throw new Error('NO_BOM')
  }

  for (const row of l1ToL2Rows) {
    const requiredQty = row.qty * qtySold

    totalCost += await consumeInventoryForItem({
      tx,
      restaurantId,
      itemId: row.l2ItemId,
      qty: requiredQty,
    })
  }

  for (const row of l1ToL3Rows) {
    const requiredQty = row.qty * qtySold

    totalCost += await consumeInventoryForItem({
      tx,
      restaurantId,
      itemId: row.l3ItemId,
      qty: requiredQty,
    })
  }

  return totalCost
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to record sales.' },
        { status: 403 }
      )
    }

    const body = await req.json()

    const soldAt = new Date(body.soldAt)
    const itemId = String(body.itemId || '')
    const qty = Number(body.qty)

    if (!itemId) {
      return NextResponse.json({ error: 'Missing sale item' }, { status: 400 })
    }

    if (Number.isNaN(soldAt.getTime())) {
      return NextResponse.json({ error: 'Valid sold date is required' }, { status: 400 })
    }

    if (!qty || qty <= 0 || Number.isNaN(qty)) {
      return NextResponse.json(
        { error: 'Quantity sold must be greater than 0' },
        { status: 400 }
      )
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

    if (item.itemType !== 'L1') {
      return NextResponse.json(
        { error: 'Sales can only be recorded for L1 dishes.' },
        { status: 400 }
      )
    }

    const sale = await prisma.$transaction(async (tx: any) => {
      const totalCost = await calculateAndConsumeL1Sale({
        tx,
        restaurantId: tenant.restaurantId,
        l1ItemId: item.id,
        qtySold: qty,
      })

      return tx.sale.create({
        data: {
          restaurantId: tenant.restaurantId,
          soldAt,
          itemId: item.id,
          qty,
          cost: totalCost,
        },
        include: {
          item: true,
        },
      })
    })

    return NextResponse.json(sale)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    if (error instanceof Error && error.message === 'NOT_ENOUGH_STOCK') {
      return NextResponse.json({ error: 'Not enough stock for sale' }, { status: 400 })
    }

    if (error instanceof Error && error.message === 'NO_BOM') {
      return NextResponse.json(
        { error: 'This L1 has no BOM. Build the dish before recording sales.' },
        { status: 400 }
      )
    }

    console.error('POST /api/sales failed:', error)
    return NextResponse.json({ error: 'Failed to save sale' }, { status: 500 })
  }
}