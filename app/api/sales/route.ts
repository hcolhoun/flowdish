import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'
import { recordSingleL1Sale } from '@/lib/sales-recording'

export async function GET() {
  try {
    const tenant = await requireTenant()

    const sales = await prisma.sale.findMany({
      where: {
        restaurantId: tenant.restaurantId,
      },
      include: { item: true },
      orderBy: { soldAt: 'desc' },
    })

    return NextResponse.json(sales)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/sales failed:', error)
    return NextResponse.json({ error: 'Failed to load sales' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to record sales.' },
        { status: 403 }
      )
    }

    const body = await req.json()

    const soldAt = new Date(body.soldAt)
    const itemId = String(body.itemId || '')
    const qty = Number(body.qty)

    if (!itemId) {
      return NextResponse.json({ error: 'Missing sale item' }, { status: 400 })
    }

    if (Number.isNaN(soldAt.getTime())) {
      return NextResponse.json({ error: 'Valid sold date is required' }, { status: 400 })
    }

    if (!qty || qty <= 0 || Number.isNaN(qty)) {
      return NextResponse.json(
        { error: 'Quantity sold must be greater than 0' },
        { status: 400 }
      )
    }

    const sale = await recordSingleL1Sale({
      restaurantId: tenant.restaurantId,
      itemId,
      soldAt,
      qty,
    })

    return NextResponse.json(sale)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    if (error instanceof Error && error.message === 'NOT_ENOUGH_STOCK') {
      return NextResponse.json({ error: 'Not enough stock for sale' }, { status: 400 })
    }

    if (error instanceof Error && error.message === 'NO_BOM') {
      return NextResponse.json(
        { error: 'This L1 has no BOM. Build the dish before recording sales.' },
        { status: 400 }
      )
    }

    if (error instanceof Error && error.message === 'ITEM_NOT_FOUND') {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    if (error instanceof Error && error.message === 'NOT_L1') {
      return NextResponse.json(
        { error: 'Sales can only be recorded for L1 dishes.' },
        { status: 400 }
      )
    }

    console.error('POST /api/sales failed:', error)
    return NextResponse.json({ error: 'Failed to save sale' }, { status: 500 })
  }
}
