import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type PrepInventoryLot = {
  id: string
  qtyInitial: number
  qtyRemaining: number
}

function parseDateOrNull(value: unknown) {
  if (!value) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

async function findPrepInventoryLots(prepBatch: {
  itemId: string
  qtyOutput: number
  expiryAt: Date | null
  preparedAt: Date
}) {
  const lots = await prisma.inventoryLot.findMany({
    where: {
      itemId: prepBatch.itemId,
      sourceType: 'PREP',
      qtyInitial: prepBatch.qtyOutput,
    },
    orderBy: { createdAt: 'asc' },
  })

  return lots.filter((lot) => {
    if (!prepBatch.expiryAt && !lot.expiryAt) return true
    if (!prepBatch.expiryAt || !lot.expiryAt) return false
    return lot.expiryAt.getTime() === prepBatch.expiryAt.getTime()
  }) as PrepInventoryLot[]
}

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
    const expiryAtFromBody = parseDateOrNull(body.expiryAt)

    if (!itemId) {
      return NextResponse.json({ error: 'Missing L2 item' }, { status: 400 })
    }

    if (Number.isNaN(preparedAt.getTime())) {
      return NextResponse.json({ error: 'Valid prepared date is required' }, { status: 400 })
    }

    if (!qtyOutput || qtyOutput <= 0 || Number.isNaN(qtyOutput)) {
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

      const availableQty = lots.reduce((sum, lot) => sum + lot.qtyRemaining, 0)

      if (availableQty < requiredQty) {
        return NextResponse.json(
          {
            error: `Insufficient stock for ${row.l3.name} [${row.l3.sku}]`,
          },
          { status: 400 }
        )
      }
    }

    const expiryAt =
      expiryAtFromBody ??
      (l2Item.shelfLifeDays != null ? addDays(preparedAt, l2Item.shelfLifeDays) : null)

    const prepBatch = await prisma.$transaction(async (tx) => {
      let totalCost = 0

      for (const row of bomRows) {
        let qtyNeeded = row.qty * scaleFactor

        const lots = await tx.inventoryLot.findMany({
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

          await tx.inventoryLot.update({
            where: { id: lot.id },
            data: {
              qtyRemaining: lot.qtyRemaining - takeQty,
            },
          })

          qtyNeeded -= takeQty
        }
      }

      const unitCost = qtyOutput > 0 ? totalCost / qtyOutput : 0

      const createdPrepBatch = await tx.prepBatch.create({
        data: {
          preparedAt,
          itemId: l2Item.id,
          qtyOutput,
          expiryAt,
        },
        include: { item: true },
      })

      await tx.inventoryLot.create({
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

      return createdPrepBatch
    })

    return NextResponse.json(prepBatch)
  } catch (error) {
    console.error('POST /api/prep failed:', error)
    return NextResponse.json({ error: 'Failed to save prep batch' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()

    const id = String(body.id || '')
    const preparedAt = new Date(body.preparedAt)
    const qtyOutput = Number(body.qtyOutput)
    const expiryAt = parseDateOrNull(body.expiryAt)

    if (!id) {
      return NextResponse.json({ error: 'Missing prep batch id' }, { status: 400 })
    }

    if (Number.isNaN(preparedAt.getTime())) {
      return NextResponse.json({ error: 'Valid prepared date is required' }, { status: 400 })
    }

    if (!qtyOutput || qtyOutput <= 0 || Number.isNaN(qtyOutput)) {
      return NextResponse.json(
        { error: 'Output quantity must be greater than 0' },
        { status: 400 }
      )
    }

    const existing = await prisma.prepBatch.findUnique({
      where: { id },
      include: { item: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Prep batch not found' }, { status: 404 })
    }

    const lotsToUpdate = await findPrepInventoryLots({
      itemId: existing.itemId,
      qtyOutput: existing.qtyOutput,
      expiryAt: existing.expiryAt,
      preparedAt: existing.preparedAt,
    })

    for (const lot of lotsToUpdate) {
      if (lot.qtyRemaining !== lot.qtyInitial) {
        return NextResponse.json(
          {
            error:
              'Cannot edit this prep batch because some of the produced stock has already been used.',
          },
          { status: 400 }
        )
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const prepBatch = await tx.prepBatch.update({
        where: { id },
        data: {
          preparedAt,
          qtyOutput,
          expiryAt,
        },
        include: { item: true },
      })

      for (const lot of lotsToUpdate) {
        await tx.inventoryLot.update({
          where: { id: lot.id },
          data: {
            qtyInitial: qtyOutput,
            qtyRemaining: qtyOutput,
            expiryAt,
          },
        })
      }

      return prepBatch
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/prep failed:', error)
    return NextResponse.json({ error: 'Failed to update prep batch' }, { status: 500 })
  }
}