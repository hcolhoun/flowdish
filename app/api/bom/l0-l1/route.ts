import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'

type BomRowInput = {
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
        itemType: 'L0',
      },
    })

    if (!parent) {
      return NextResponse.json({ error: 'L0 parent not found' }, { status: 404 })
    }

    const rows = await prisma.bomL0L1.findMany({
      where: {
        restaurantId: tenant.restaurantId,
        l0ItemId: parentId,
      },
      include: {
        l0: true,
        l1: true,
      },
      orderBy: { id: 'asc' },
    })

    return NextResponse.json(rows)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/bom/l0-l1 failed:', error)
    return NextResponse.json({ error: 'Failed to load L0 → L1 BOM' }, { status: 500 })
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
    const rows = Array.isArray(body.rows) ? (body.rows as BomRowInput[]) : []

    if (!parentId) {
      return NextResponse.json({ error: 'Missing parentId' }, { status: 400 })
    }

    const parent = await prisma.item.findFirst({
      where: {
        id: parentId,
        restaurantId: tenant.restaurantId,
        itemType: 'L0',
      },
    })

    if (!parent) {
      return NextResponse.json({ error: 'Parent must be an L0 item' }, { status: 400 })
    }

    const cleanRows = rows
      .filter((row) => row.childId && Number(row.qty) > 0)
      .map((row) => ({
        childId: String(row.childId),
        qty: Number(row.qty),
      }))

    for (const row of cleanRows) {
      const child = await prisma.item.findFirst({
        where: {
          id: row.childId,
          restaurantId: tenant.restaurantId,
          itemType: 'L1',
        },
      })

      if (!child) {
        return NextResponse.json({ error: 'Every child row must be an L1 item.' }, { status: 400 })
      }
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.bomL0L1.deleteMany({
        where: {
          restaurantId: tenant.restaurantId,
          l0ItemId: parentId,
        },
      })

      if (cleanRows.length > 0) {
        await tx.bomL0L1.createMany({
          data: cleanRows.map((row) => ({
            restaurantId: tenant.restaurantId,
            l0ItemId: parentId,
            l1ItemId: row.childId,
            qty: row.qty,
          })),
        })
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('POST /api/bom/l0-l1 failed:', error)
    return NextResponse.json({ error: 'Failed to save L0 → L1 BOM' }, { status: 500 })
  }
}