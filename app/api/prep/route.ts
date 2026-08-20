import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireKitchenAccess, kitchenAccessErrorResponse } from '@/lib/kitchen-access'

type RequiredComponent = {
  itemId: string
  qty: number
  label: string
}

type HaccpRecordInput = {
  hasAny: boolean
  data: {
    cookingEnabled: boolean
    cookingStartedAt: Date | null
    cookingFinishedAt: Date | null
    cookingCoreTempC: number | null
    coolingEnabled: boolean
    coolingIntoFridgeAt: Date | null
    reheatingEnabled: boolean
    reheatingCoreTempC: number | null
    hotHoldEnabled: boolean
    hotHoldStartedAt: Date | null
    hotHoldCoreTemp1C: number | null
    hotHoldCoreTemp2C: number | null
    hotHoldCoreTemp3C: number | null
  }
}

function actorFieldsFromKitchenAccess(tenant: Awaited<ReturnType<typeof requireKitchenAccess>>) {
  if (tenant.type === 'STAFF') {
    return {
      enteredByType: 'STAFF',
      enteredByName: tenant.displayName,
      enteredByEmail: null,
      enteredByAuthUserId: null,
      enteredByStaffUserId: tenant.staffUserId,
    }
  }

  return {
    enteredByType: tenant.isSystemOwner ? 'SYSTEM_OWNER' : tenant.role,
    enteredByName: tenant.email || 'Chef',
    enteredByEmail: tenant.email,
    enteredByAuthUserId: tenant.authUserId,
    enteredByStaffUserId: null,
  }
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null

  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function nullableDate(value: unknown) {
  if (value === null || value === undefined || value === '') return null

  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? 'INVALID_DATE' : date
}

function haccpRecordInputFromBody(value: any): HaccpRecordInput {
  const source = value && typeof value === 'object' ? value : {}
  const cookingEnabled = Boolean(source.cookingEnabled)
  const coolingEnabled = Boolean(source.coolingEnabled)
  const reheatingEnabled = Boolean(source.reheatingEnabled)
  const hotHoldEnabled = Boolean(source.hotHoldEnabled)

  const data = {
    cookingEnabled,
    cookingStartedAt: cookingEnabled ? nullableDate(source.cookingStartedAt) : null,
    cookingFinishedAt: cookingEnabled ? nullableDate(source.cookingFinishedAt) : null,
    cookingCoreTempC: cookingEnabled ? nullableNumber(source.cookingCoreTempC) : null,
    coolingEnabled,
    coolingIntoFridgeAt: coolingEnabled ? nullableDate(source.coolingIntoFridgeAt) : null,
    reheatingEnabled,
    reheatingCoreTempC: reheatingEnabled ? nullableNumber(source.reheatingCoreTempC) : null,
    hotHoldEnabled,
    hotHoldStartedAt: hotHoldEnabled ? nullableDate(source.hotHoldStartedAt) : null,
    hotHoldCoreTemp1C: hotHoldEnabled ? nullableNumber(source.hotHoldCoreTemp1C) : null,
    hotHoldCoreTemp2C: hotHoldEnabled ? nullableNumber(source.hotHoldCoreTemp2C) : null,
    hotHoldCoreTemp3C: hotHoldEnabled ? nullableNumber(source.hotHoldCoreTemp3C) : null,
  }

  if (
    data.cookingStartedAt === 'INVALID_DATE' ||
    data.cookingFinishedAt === 'INVALID_DATE' ||
    data.coolingIntoFridgeAt === 'INVALID_DATE' ||
    data.hotHoldStartedAt === 'INVALID_DATE'
  ) {
    throw new Error('INVALID_HACCP_DATE')
  }

  return {
    hasAny: cookingEnabled || coolingEnabled || reheatingEnabled || hotHoldEnabled,
    data: data as HaccpRecordInput['data'],
  }
}

export async function GET() {
  try {
    const tenant = await requireKitchenAccess()

    const prepBatches = await prisma.prepBatch.findMany({
      where: {
        restaurantId: tenant.restaurantId,
      },
      include: { item: true, haccpRecord: true },
      orderBy: { preparedAt: 'desc' },
    })

    return NextResponse.json(prepBatches)
  } catch (error) {
    const accessError = kitchenAccessErrorResponse(error)
    if (accessError) return accessError

    console.error('GET /api/prep failed:', error)
    return NextResponse.json({ error: 'Failed to load prep batches' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requireKitchenAccess()

    if (!tenant.canRecordPrepWaste) {
      return NextResponse.json(
        { error: 'You do not have permission to record prep.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const haccpRecord = haccpRecordInputFromBody(body.haccpRecord)

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
          ...actorFieldsFromKitchenAccess(tenant),
        },
        include: { item: true },
      })

      if (haccpRecord.hasAny) {
        await tx.prepHaccpRecord.create({
          data: {
            restaurantId: tenant.restaurantId,
            prepBatchId: prepBatch.id,
            ...haccpRecord.data,
          },
        })
      }

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
          prepBatchId: prepBatch.id,
        },
      })

      return tx.prepBatch.findUnique({
        where: { id: prepBatch.id },
        include: { item: true, haccpRecord: true },
      })
    })

    return NextResponse.json(result)
  } catch (error) {
    const accessError = kitchenAccessErrorResponse(error)
    if (accessError) return accessError

    if (error instanceof Error && error.message === 'INVALID_HACCP_DATE') {
      return NextResponse.json({ error: 'Valid HACCP dates are required' }, { status: 400 })
    }

    console.error('POST /api/prep failed:', error)
    return NextResponse.json({ error: 'Failed to save prep batch' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const tenant = await requireKitchenAccess()

    if (!tenant.canRecordPrepWaste) {
      return NextResponse.json(
        { error: 'You do not have permission to update prep.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const id = String(body.id || '')

    if (!id) {
      return NextResponse.json({ error: 'Missing prep batch id' }, { status: 400 })
    }

    const existing = await prisma.prepBatch.findFirst({
      where: {
        id,
        restaurantId: tenant.restaurantId,
      },
      include: {
        item: true,
        haccpRecord: true,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Prep batch not found' }, { status: 404 })
    }

    const updateData: any = {}

    if ('preparedAt' in body) {
      const preparedAt = new Date(body.preparedAt)

      if (Number.isNaN(preparedAt.getTime())) {
        return NextResponse.json({ error: 'Valid prepared date is required' }, { status: 400 })
      }

      updateData.preparedAt = preparedAt
    }

    if ('qtyOutput' in body) {
      const qtyOutput = Number(body.qtyOutput)

      if (!qtyOutput || qtyOutput <= 0 || Number.isNaN(qtyOutput)) {
        return NextResponse.json(
          { error: 'Output quantity must be greater than 0' },
          { status: 400 }
        )
      }

      updateData.qtyOutput = qtyOutput
    }

    if ('expiryAt' in body) {
      const expiryAt =
        body.expiryAt !== undefined && body.expiryAt !== null && body.expiryAt !== ''
          ? new Date(body.expiryAt)
          : null

      if (expiryAt && Number.isNaN(expiryAt.getTime())) {
        return NextResponse.json({ error: 'Valid expiry date is required' }, { status: 400 })
      }

      updateData.expiryAt = expiryAt
    }

    const haccpRecordIncluded = 'haccpRecord' in body
    const haccpRecord = haccpRecordInputFromBody(body.haccpRecord)
    const stockFieldsChanged =
      ('qtyOutput' in updateData && updateData.qtyOutput !== existing.qtyOutput) ||
      ('expiryAt' in updateData &&
        (updateData.expiryAt?.getTime() ?? null) !==
          (existing.expiryAt?.getTime() ?? null))

    const updated = await prisma.$transaction(async (tx: any) => {
      const linkedLots = await tx.inventoryLot.findMany({
        where: {
          restaurantId: tenant.restaurantId,
          prepBatchId: existing.id,
          sourceType: 'PREP',
        },
      })

      if (stockFieldsChanged) {
        if (linkedLots.length === 0) {
          throw new Error('PREP_LOT_NOT_LINKED')
        }

        const usedLot = linkedLots.find((lot: any) => lot.qtyRemaining !== lot.qtyInitial)

        if (usedLot) {
          throw new Error('PREP_STOCK_USED')
        }
      }

      await tx.prepBatch.update({
        where: { id: existing.id },
        data: updateData,
      })

      if (haccpRecordIncluded && (haccpRecord.hasAny || existing.haccpRecord)) {
        await tx.prepHaccpRecord.upsert({
          where: { prepBatchId: existing.id },
          create: {
            restaurantId: tenant.restaurantId,
            prepBatchId: existing.id,
            ...haccpRecord.data,
          },
          update: haccpRecord.data,
        })
      }

      if (linkedLots.length > 0) {
        const lotData: any = {}

        if ('qtyOutput' in updateData) {
          lotData.qtyInitial = updateData.qtyOutput
          lotData.qtyRemaining = updateData.qtyOutput
        }

        if ('expiryAt' in updateData) {
          lotData.expiryAt = updateData.expiryAt
        }

        if (Object.keys(lotData).length > 0) {
          await tx.inventoryLot.updateMany({
            where: {
              restaurantId: tenant.restaurantId,
              prepBatchId: existing.id,
              sourceType: 'PREP',
            },
            data: lotData,
          })
        }
      }

      return tx.prepBatch.findUnique({
        where: { id: existing.id },
        include: { item: true, haccpRecord: true },
      })
    })

    return NextResponse.json(updated)
  } catch (error) {
    const accessError = kitchenAccessErrorResponse(error)
    if (accessError) return accessError

    if (error instanceof Error && error.message === 'INVALID_HACCP_DATE') {
      return NextResponse.json({ error: 'Valid HACCP dates are required' }, { status: 400 })
    }

    if (error instanceof Error && error.message === 'PREP_STOCK_USED') {
      return NextResponse.json(
        { error: 'Prep batch cannot be edited because the produced stock has been used.' },
        { status: 400 }
      )
    }

    if (error instanceof Error && error.message === 'PREP_LOT_NOT_LINKED') {
      return NextResponse.json(
        { error: 'Prep batch stock lot was not found, so quantity or expiry cannot be edited.' },
        { status: 400 }
      )
    }

    console.error('PATCH /api/prep failed:', error)
    return NextResponse.json({ error: 'Failed to update prep batch' }, { status: 500 })
  }
}
