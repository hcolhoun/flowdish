import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  consumeInventoryFifo,
  ensureEnoughStock,
  getItemById,
} from '@/lib/inventory'

export async function GET() {
  try {
    const sales = await prisma.sale.findMany({
      include: { item: true },
      orderBy: { soldAt: 'desc' },
    })

    return NextResponse.json(sales)
  } catch (error) {
    console.error('GET /api/sales failed:', error)
    return NextResponse.json({ error: 'Failed to load sales' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const soldAt = new Date(body.soldAt)
    const itemId = body.itemId
    const qty = Number(body.qty)

    let totalCost = 0
    let qtyNeeded = qty

    const lots = await prisma.inventoryLot.findMany({
      where: {
        itemId,
        qtyRemaining: { gt: 0 },
      },
      orderBy: { createdAt: 'asc' },
    })

    for (const lot of lots) {
      if (qtyNeeded <= 0) break

      const takeQty = Math.min(lot.qtyRemaining, qtyNeeded)

      totalCost += takeQty * lot.unitCost

      await prisma.inventoryLot.update({
        where: { id: lot.id },
        data: {
          qtyRemaining: lot.qtyRemaining - takeQty,
        },
      })

      qtyNeeded -= takeQty
    }

    if (qtyNeeded > 0) {
      return NextResponse.json(
        { error: 'Not enough stock for sale' },
        { status: 400 }
      )
    }

    const sale = await prisma.sale.create({
      data: {
        soldAt,
        itemId,
        qty,
        cost: totalCost,
      },
    })

    return NextResponse.json(sale)
  } catch (error) {
    console.error('POST /api/sales failed:', error)
    return NextResponse.json({ error: 'Failed to save sale' }, { status: 500 })
  }
}