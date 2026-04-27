import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  consumeInventoryFifo,
  ensureEnoughStock,
  getItemById,
} from '@/lib/inventory'

export async function GET() {
  try {
    const wastes = await prisma.waste.findMany({
      include: { item: true },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(wastes)
  } catch (error) {
    console.error('GET /api/waste failed:', error)
    return NextResponse.json({ error: 'Failed to load waste records' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const item = await getItemById(body.itemId)

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const date = new Date(body.date)
    const qty = Number(body.qty)
    const reason = body.reason ? String(body.reason) : null

    if (!qty || qty <= 0) {
      return NextResponse.json({ error: 'Quantity must be greater than 0' }, { status: 400 })
    }

    const enough = await ensureEnoughStock(item.id, qty)

    if (!enough) {
      return NextResponse.json(
        { error: `Insufficient stock for ${item.name} [${item.sku}]` },
        { status: 400 }
      )
    }

    await consumeInventoryFifo(item.id, qty)

    const waste = await prisma.waste.create({
      data: {
        date,
        itemId: item.id,
        qty,
      },
      include: { item: true },
    })

    return NextResponse.json({ ...waste, reason })
  } catch (error) {
    console.error('POST /api/waste failed:', error)
    return NextResponse.json({ error: 'Failed to save waste record' }, { status: 500 })
  }
}