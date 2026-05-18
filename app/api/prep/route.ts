import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'

type RequiredComponent = {
  itemId: string
  qty: number
  label: string
}

export async function GET() {
  try {
    const tenant = await requireTenant()

    const prepBatches = await prisma.prepBatch.findMany({
      where: {
        restaurantId: tenant.restaurantId,
      },
      include: { item: true },
      orderBy: { preparedAt: 'desc' },
    })

    return NextResponse.json(prepBatches)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/prep failed:', error)
    return NextResponse.json({ error: 'Failed to load prep batches' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to record prep.' },
        { status: 403 }
      )
    }

    const body = await req.json()

    const itemId = String(body.itemId || '')
    const preparedAt = new Date(body.preparedAt)
    const qtyOutput = Number(body.qtyOutput)

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

    const l2Item = await prisma.item.findFirst({
      where: {
        id: itemId,
        restaurantId: tenant.restaurantId,
      },
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

    const [l2Rows, l3Rows] = await Promise.all([
      prisma.bomL2L2.findMany({
        where: {
          restaurantId: tenant.restaurantId,
          parentL2ItemId: l2Item.id,
        },
        include: { childL2: true },
      }),

      prisma.bomL2L3.findMany({
        where: {
          restaurantId: tenant.restaurantId,
          l2ItemId: l2Item.id,
        },
        include: { l3: true },
      }),
    ])

    const hasNoBomRows = l2Rows.length === 0 && l3Rows.length === 0

    if (hasNoBomRows && l2Item.buildStatus !== 'BUILT') {
      return NextResponse.json(
        {
          error:
            'This L2 has no BOM and has not been saved as built. Open it in BOM Builder and click Save L2 as Built first.',
        },
        { status: 400 }
      )
    }

    const scaleFactor = qtyOutput / l2Item.standardBatchOutput

    const requiredComponents: RequiredComponent[] = [
      ...(l2Rows as any[]).map((row: any) => ({
        itemId: row.childL2ItemId,
        qty: row.qty * scaleFactor,
        label: `${row.childL2.name} [${row.childL2.sku}]`,
      })),

      ...(l3Rows as any[]).map((row: any) => ({
        itemId: row.l3ItemId,
        qty: row.qty * scaleFactor,
        label: `${row.l3.name} [${row.l3.sku}]`,
      })),
    ]

    const requiredByItemId = new Map<string, RequiredComponent>()

    for (const component of requiredComponents) {
      const existing = requiredByItemId.get(component.itemId)

      if (existing) {
        existing.qty += component.qty
      } else {
        requiredByItemId.set(component.itemId, { ...component })
      }
    }

    for (const component of requiredByItemId.values()) {
      const lots = await prisma.inventoryLot.findMany({
        where: {
          restaurantId: tenant.restaurantId,
          itemId: component.itemId,
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

      if (availableQty < component.qty) {
        return NextResponse.json(
          {
            error: `Insufficient stock for ${component.label}. Required ${component.qty}, available ${availableQty}.`,
          },
          { status: 400 }
        )
      }
    }

    const expiryAt =
      body.expiryAt !== undefined && body.expiryAt !== null && body.expiryAt !== ''
        ? new Date(body.expiryAt)
        : l2Item.shelfLifeDays != null
          ? new Date(preparedAt.getTime() + l2Item.shelfLifeDays * 24 * 60 * 60 * 1000)
          : null

    if (expiryAt && Number.isNaN(expiryAt.getTime())) {
      return NextResponse.json({ error: 'Valid expiry date is required' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx: any) => {
      let totalCost = 0

      for (const component of requiredByItemId.values()) {
        let qtyNeeded = component.qty

        const lots = await tx.inventoryLot.findMany({
          where: {
            restaurantId: tenant.restaurantId,
            itemId: component.itemId,
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

      const prepBatch = await tx.prepBatch.create({
        data: {
          restaurantId: tenant.restaurantId,
          preparedAt,
          itemId: l2Item.id,
          qtyOutput,
          expiryAt,
        },
        include: { item: true },
      })

      await tx.inventoryLot.create({
        data: {
          restaurantId: tenant.restaurantId,
          itemId: l2Item.id,
          qtyInitial: qtyOutput,
          qtyRemaining: qtyOutput,
          unitType: l2Item.unitType,
          expiryAt,
          sourceType: 'PREP',
          unitCost,
        },
      })

      return prepBatch
    })

    return NextResponse.json(result)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('POST /api/prep failed:', error)
    return NextResponse.json({ error: 'Failed to save prep batch' }, { status: 500 })
  }
}