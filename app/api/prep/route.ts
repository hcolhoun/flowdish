import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  addInventoryLot,
  consumeInventoryFifo,
  ensureEnoughStock,
  getItemById,
} from '@/lib/inventory'
import { InventorySourceType } from '@prisma/client'

export async function GET() {
  try {
    const prepBatches = await prisma.prepBatch.findMany({
      include: { item: true },
      orderBy: { preparedAt: 'desc' },
    })

    return NextResponse.json(prepBatches)
  } catch (error) {
    console.error('GET /api/prep failed:', error)
    return NextResponse.json({ error: 'Failed to load prep batches' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const preparedAt = new Date(body.preparedAt)
    const itemId = body.itemId
    const qtyOutput = Number(body.qtyOutput)

    const item = await prisma.item.findUnique({
      where: { id: itemId },
    })

    if (!item || item.itemType !== 'L2') {
      return NextResponse.json({ error: 'Invalid L2 item' }, { status: 400 })
    }

    const bom = await prisma.bomL2L3.findMany({
      where: { l2ItemId: itemId },
    })

    let totalCost = 0

    for (const row of bom) {
      let qtyNeeded = row.qty * qtyOutput

      const lots = await prisma.inventoryLot.findMany({
        where: {
          itemId: row.l3ItemId,
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
          { error: 'Not enough inventory for prep' },
          { status: 400 }
        )
      }
    }

    const unitCost = totalCost / qtyOutput

    await prisma.inventoryLot.create({
      data: {
        itemId,
        qtyInitial: qtyOutput,
        qtyRemaining: qtyOutput,
        unitType: item.unitType,
        expiryAt: null,
        sourceType: 'PREP',
        unitCost,
      },
    })

    const prepBatch = await prisma.prepBatch.create({
      data: {
        preparedAt,
        itemId,
        qtyOutput,
      },
    })

    return NextResponse.json(prepBatch)
  } catch (error) {
    console.error('POST /api/prep failed:', error)
    return NextResponse.json({ error: 'Failed to save prep' }, { status: 500 })
  }
}