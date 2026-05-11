import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

class StockError extends Error {
  status = 400
}

type StockRequirement = {
  itemId: string
  qty: number
  name: string
  sku: string
  unitType: string
}

function combineRequirements(requirements: StockRequirement[]) {
  const map = new Map<string, StockRequirement>()

  for (const req of requirements) {
    const existing = map.get(req.itemId)

    if (existing) {
      existing.qty += req.qty
    } else {
      map.set(req.itemId, { ...req })
    }
  }

  return Array.from(map.values())
}

async function consumeItemStock(
  tx: any,
  requirement: StockRequirement
) {
  const lots = await tx.inventoryLot.findMany({
    where: {
      itemId: requirement.itemId,
      qtyRemaining: { gt: 0 },
    },
    orderBy: [
      { expiryAt: 'asc' },
      { createdAt: 'asc' },
    ],
  })

  const availableQty = lots.reduce(
    (sum: number, lot: any) => sum + Number(lot.qtyRemaining),
    0
  )

  if (availableQty < requirement.qty) {
    throw new StockError(
      `Not enough stock for ${requirement.name} [${requirement.sku}]. Required ${requirement.qty} ${requirement.unitType}, available ${availableQty} ${requirement.unitType}.`
    )
  }

  let qtyNeeded = requirement.qty
  let totalCost = 0

  for (const lot of lots) {
    if (qtyNeeded <= 0) break

    const takeQty = Math.min(Number(lot.qtyRemaining), qtyNeeded)

    totalCost += takeQty * Number(lot.unitCost ?? 0)

    await tx.inventoryLot.update({
      where: { id: lot.id },
      data: {
        qtyRemaining: Number(lot.qtyRemaining) - takeQty,
      },
    })

    qtyNeeded -= takeQty
  }

  return totalCost
}

async function buildL1Requirements(l1ItemId: string, saleQty: number) {
  const [l1ToL2Rows, l1ToL3Rows] = await Promise.all([
    prisma.bomL1L2.findMany({
      where: { l1ItemId },
      include: { l2: true },
    }),

    prisma.bomL1L3.findMany({
      where: { l1ItemId },
      include: { l3: true },
    }),
  ])

  const requirements: StockRequirement[] = []

  for (const row of l1ToL2Rows) {
    requirements.push({
      itemId: row.l2ItemId,
      qty: row.qty * saleQty,
      name: row.l2.name,
      sku: row.l2.sku,
      unitType: row.l2.unitType,
    })
  }

  for (const row of l1ToL3Rows) {
    requirements.push({
      itemId: row.l3ItemId,
      qty: row.qty * saleQty,
      name: row.l3.name,
      sku: row.l3.sku,
      unitType: row.l3.unitType,
    })
  }

  return combineRequirements(requirements)
}

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
    const itemId = String(body.itemId || '')
    const qty = Number(body.qty)

    if (!itemId) {
      return NextResponse.json({ error: 'Missing item' }, { status: 400 })
    }

    if (Number.isNaN(soldAt.getTime())) {
      return NextResponse.json({ error: 'Valid sale date is required' }, { status: 400 })
    }

    if (!qty || qty <= 0 || Number.isNaN(qty)) {
      return NextResponse.json({ error: 'Quantity must be greater than 0' }, { status: 400 })
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
    })

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    let requirements: StockRequirement[] = []

    if (item.itemType === 'L1') {
      requirements = await buildL1Requirements(item.id, qty)

      if (requirements.length === 0) {
        return NextResponse.json(
          {
            error:
              'This L1 has no BOM rows. Add L1 → L2 or L1 → L3 rows in BOM Builder before recording sales.',
          },
          { status: 400 }
        )
      }
    } else {
      requirements = [
        {
          itemId: item.id,
          qty,
          name: item.name,
          sku: item.sku,
          unitType: item.unitType,
        },
      ]
    }

    const sale = await prisma.$transaction(async (tx) => {
      let totalCost = 0

      for (const requirement of requirements) {
        totalCost += await consumeItemStock(tx, requirement)
      }

      return tx.sale.create({
        data: {
          soldAt,
          itemId: item.id,
          qty,
          cost: totalCost,
        },
        include: { item: true },
      })
    })

    return NextResponse.json(sale)
  } catch (error) {
    console.error('POST /api/sales failed:', error)

    if (error instanceof StockError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    return NextResponse.json({ error: 'Failed to save sale' }, { status: 500 })
  }
}