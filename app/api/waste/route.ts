import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireKitchenAccess, kitchenAccessErrorResponse } from '@/lib/kitchen-access'
import { calculateAndConsumeL1Sale, consumeInventoryForItem } from '@/lib/sales-recording'

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

export async function GET() {
  try {
    const tenant = await requireKitchenAccess()

    const wastes = await prisma.waste.findMany({
      where: {
        restaurantId: tenant.restaurantId,
      },
      include: { item: true },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(wastes)
  } catch (error) {
    const accessError = kitchenAccessErrorResponse(error)
    if (accessError) return accessError

    console.error('GET /api/waste failed:', error)
    return NextResponse.json({ error: 'Failed to load waste records' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requireKitchenAccess()

    if (!tenant.canRecordPrepWaste) {
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

    if (item.itemType !== 'L1' && item.itemType !== 'L2' && item.itemType !== 'L3') {
      return NextResponse.json(
        { error: 'Waste can only be recorded against an L1, L2, or L3 item.' },
        { status: 400 }
      )
    }

    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Invalid waste date' }, { status: 400 })
    }

    if (!qty || qty <= 0 || Number.isNaN(qty)) {
      return NextResponse.json({ error: 'Quantity must be greater than 0' }, { status: 400 })
    }

    const waste = await prisma.$transaction(async (tx: any) => {
      const cost =
        item.itemType === 'L1'
          ? await calculateAndConsumeL1Sale({
              tx,
              restaurantId: tenant.restaurantId,
              l1ItemId: item.id,
              qtySold: qty,
            })
          : await consumeInventoryForItem({
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
          cost,
          reason,
          ...actorFieldsFromKitchenAccess(tenant),
        },
        include: { item: true },
      })
    })

    return NextResponse.json(waste)
  } catch (error) {
    const accessError = kitchenAccessErrorResponse(error)
    if (accessError) return accessError

    if (error instanceof Error && error.message === 'NOT_ENOUGH_STOCK') {
      return NextResponse.json(
        { error: 'Insufficient ingredient or prep stock for this waste record.' },
        { status: 400 }
      )
    }

    if (error instanceof Error && error.message === 'NO_BOM') {
      return NextResponse.json(
        { error: 'This L1 dish needs a saved BOM before it can be recorded as waste.' },
        { status: 400 }
      )
    }

    console.error('POST /api/waste failed:', error)
    return NextResponse.json({ error: 'Failed to save waste record' }, { status: 500 })
  }
}
