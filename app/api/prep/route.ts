import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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

    const itemId = String(body.itemId || '')
    const preparedAt = new Date(body.preparedAt)
    const qtyOutput = Number(body.qtyOutput)

    if (!itemId) {
      return NextResponse.json({ error: 'Missing L2 item' }, { status: 400 })
    }

    if (!qtyOutput || qtyOutput <= 0) {
      return NextResponse.json(
        { error: 'Output quantity must be greater than 0' },
        { status: 400 }
      )
    }

    const l2Item = await prisma.item.findUnique({
      where: { id: itemId },
    })

    if (!l2Item) {
      return NextResponse.json({ error: 'L2 item not found' }, { status: 404 })
    }

    if (l2Item.itemType !== 'L2') {
      return NextResponse.json(
        { error: 'Prep can only be recorded for L2 items' },
        { status: 400 }
      )
    }

    if (!l2Item.standardBatchOutput || l2Item.standardBatchOutput <= 0) {
      return NextResponse.json(
        { error: 'Standard batch output is missing for this L2 item' },
        { status: 400 }
      )
    }

    const bomRows = await prisma.bomL2L3.findMany({
      where: { l2ItemId: l2Item.id },
      include: { l3: true },
    })

    if (bomRows.length === 0) {
      return NextResponse.json(
        { error: 'No L2 → L3 BOM found for this prep item' },
        { status: 400 }
      )
    }

    const scaleFactor = qtyOutput / l2Item.standardBatchOutput

    // First check stock availability before changing anything
    for (const row of bomRows) {
      const requiredQty = row.qty * scaleFactor

      const lots = await prisma.inventoryLot.findMany({
        where: {
          itemId: row.l3ItemId,
          qtyRemaining: { gt: 0 },
        },
        orderBy: [
          { expiryAt: 'asc' },
          { createdAt: 'asc' },
        ],
      })

      const availableQty = lots.reduce(
        (sum: number, lot: any) => sum + lot.qtyRemaining,
        0
      )

      if (availableQty < requiredQty) {
        return NextResponse.json(
          {
            error: `Insufficient stock for ${row.l3.name} [${row.l3.sku}]`,
          },
          { status: 400 }
        )
      }
    }

    let totalCost = 0

    // Consume L3 stock FIFO and calculate real cost
    for (const row of bomRows) {
      let qtyNeeded = row.qty * scaleFactor

      const lots = await prisma.inventoryLot.findMany({
        where: {
          itemId: row.l3ItemId,
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

        await prisma.inventoryLot.update({
          where: { id: lot.id },
          data: {
            qtyRemaining: lot.qtyRemaining - takeQty,
          },
        })

        qtyNeeded -= takeQty
      }
    }

    const unitCost = qtyOutput > 0 ? totalCost / qtyOutput : 0

    const expiryAt =
      l2Item.shelfLifeDays != null
        ? new Date(preparedAt.getTime() + l2Item.shelfLifeDays * 24 * 60 * 60 * 1000)
        : null

    const prepBatch = await prisma.prepBatch.create({
      data: {
        preparedAt,
        itemId: l2Item.id,
        qtyOutput,
        expiryAt,
      },
      include: { item: true },
    })

    await prisma.inventoryLot.create({
      data: {
        itemId: l2Item.id,
        qtyInitial: qtyOutput,
        qtyRemaining: qtyOutput,
        unitType: l2Item.unitType,
        expiryAt,
        sourceType: 'PREP',
        unitCost,
      },
    })

    return NextResponse.json(prepBatch)
  } catch (error) {
    console.error('POST /api/prep failed:', error)
    return NextResponse.json({ error: 'Failed to save prep batch' }, { status: 500 })
  }
}