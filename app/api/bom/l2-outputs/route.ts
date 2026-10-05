import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'
import { markL2PrepTimeStale } from '@/lib/l2-prep-time'

type OutputRowInput = {
  childId: string
  qty: number
}

export async function GET(req: Request) {
  try {
    const tenant = await requireTenant()
    const { searchParams } = new URL(req.url)
    const parentId = searchParams.get('parentId')

    if (!parentId) {
      return NextResponse.json({ error: 'Missing parentId' }, { status: 400 })
    }

    const parent = await prisma.item.findFirst({
      where: {
        id: parentId,
        restaurantId: tenant.restaurantId,
        itemType: 'L2',
      },
      select: { id: true },
    })

    if (!parent) {
      return NextResponse.json({ error: 'L2 parent not found' }, { status: 404 })
    }

    const rows = await prisma.bomL2Output.findMany({
      where: {
        restaurantId: tenant.restaurantId,
        parentL2ItemId: parentId,
      },
      include: { outputL2: true },
      orderBy: { id: 'asc' },
    })

    return NextResponse.json(rows)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/bom/l2-outputs failed:', error)
    return NextResponse.json({ error: 'Failed to load additional L2 outputs' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json({ error: 'You do not have permission to update BOMs.' }, { status: 403 })
    }

    const body = await req.json()
    const parentId = String(body.parentId || '')
    const rows = Array.isArray(body.rows) ? (body.rows as OutputRowInput[]) : []

    if (!parentId) {
      return NextResponse.json({ error: 'Missing parentId' }, { status: 400 })
    }

    const parent = await prisma.item.findFirst({
      where: {
        id: parentId,
        restaurantId: tenant.restaurantId,
        itemType: 'L2',
      },
    })

    if (!parent) {
      return NextResponse.json({ error: 'Parent must be an L2 item' }, { status: 400 })
    }

    const cleanRows = rows
      .filter((row) => row.childId && Number(row.qty) > 0)
      .map((row) => ({ childId: String(row.childId), qty: Number(row.qty) }))

    if (new Set(cleanRows.map((row) => row.childId)).size !== cleanRows.length) {
      return NextResponse.json({ error: 'Each additional output can only be added once.' }, { status: 400 })
    }

    if (cleanRows.some((row) => row.childId === parent.id)) {
      return NextResponse.json(
        { error: 'The primary L2 item cannot also be an additional output.' },
        { status: 400 }
      )
    }

    if (cleanRows.length > 0 && (!parent.standardBatchOutput || parent.standardBatchOutput <= 0)) {
      return NextResponse.json(
        { error: 'Set the primary standard batch output before adding other outputs.' },
        { status: 400 }
      )
    }

    const outputItems = cleanRows.length
      ? await prisma.item.findMany({
          where: {
            restaurantId: tenant.restaurantId,
            id: { in: cleanRows.map((row) => row.childId) },
            itemType: 'L2',
          },
        })
      : []

    if (outputItems.length !== cleanRows.length) {
      return NextResponse.json(
        { error: 'Every additional output must be an L2 item.' },
        { status: 400 }
      )
    }

    if (outputItems.some((item) => item.unitType !== parent.unitType)) {
      return NextResponse.json(
        { error: `Additional outputs must use the same ${parent.unitType} unit as the primary output.` },
        { status: 400 }
      )
    }

    if (cleanRows.length > 0 && (parent.unitType === 'g' || parent.unitType === 'ml')) {
      const [l2Inputs, l3Inputs] = await Promise.all([
        prisma.bomL2L2.findMany({
          where: {
            restaurantId: tenant.restaurantId,
            parentL2ItemId: parent.id,
          },
          include: { childL2: { select: { unitType: true } } },
        }),
        prisma.bomL2L3.findMany({
          where: {
            restaurantId: tenant.restaurantId,
            l2ItemId: parent.id,
          },
          include: { l3: { select: { unitType: true } } },
        }),
      ])

      const comparableInputQty = [
        ...l2Inputs.map((row) => ({ qty: row.qty, unitType: row.childL2.unitType })),
        ...l3Inputs.map((row) => ({ qty: row.qty, unitType: row.l3.unitType })),
      ]
        .filter((row) => row.unitType === 'g' || row.unitType === 'ml')
        .reduce((sum, row) => sum + row.qty, 0)

      const combinedOutputQty =
        parent.standardBatchOutput! + cleanRows.reduce((sum, row) => sum + row.qty, 0)

      if (comparableInputQty > 0 && combinedOutputQty > comparableInputQty + 0.000001) {
        return NextResponse.json(
          {
            error: `Combined outputs (${combinedOutputQty} ${parent.unitType}) cannot exceed the comparable BOM input (${comparableInputQty} g/ml).`,
          },
          { status: 400 }
        )
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.bomL2Output.deleteMany({
        where: {
          restaurantId: tenant.restaurantId,
          parentL2ItemId: parent.id,
        },
      })

      if (cleanRows.length > 0) {
        await tx.bomL2Output.createMany({
          data: cleanRows.map((row) => ({
            restaurantId: tenant.restaurantId,
            parentL2ItemId: parent.id,
            outputL2ItemId: row.childId,
            qty: row.qty,
          })),
        })
      }
    })

    await markL2PrepTimeStale(tenant.restaurantId, parent.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('POST /api/bom/l2-outputs failed:', error)
    return NextResponse.json({ error: 'Failed to save additional L2 outputs' }, { status: 500 })
  }
}
