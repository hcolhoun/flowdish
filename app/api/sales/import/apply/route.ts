import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'
import { recordL1Sale } from '@/lib/sales-recording'

type IncomingRow = {
  itemId?: string
  qty?: number | string
  selected?: boolean
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
    const rows = Array.isArray(body.rows) ? (body.rows as IncomingRow[]) : []

    if (Number.isNaN(soldAt.getTime())) {
      return NextResponse.json({ error: 'Valid sold date is required.' }, { status: 400 })
    }

    const selectedRows = rows.filter((row) => row.selected !== false)

    if (selectedRows.length === 0) {
      return NextResponse.json({ error: 'No selected sales rows to save.' }, { status: 400 })
    }

    const invalidRows = selectedRows.filter((row) => {
      const qty = Number(row.qty)
      return !row.itemId || !Number.isFinite(qty) || qty <= 0
    })

    if (invalidRows.length > 0) {
      return NextResponse.json(
        { error: `${invalidRows.length} selected row(s) need an L1 item and quantity.` },
        { status: 400 }
      )
    }

    const sales = await prisma.$transaction(async (tx: any) => {
      const saved = []

      for (const row of selectedRows) {
        saved.push(
          await recordL1Sale({
            tx,
            restaurantId: tenant.restaurantId,
            itemId: String(row.itemId),
            soldAt,
            qty: Number(row.qty),
          })
        )
      }

      return saved
    })

    return NextResponse.json({
      success: true,
      savedCount: sales.length,
      sales,
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    if (error instanceof Error && error.message === 'NOT_ENOUGH_STOCK') {
      return NextResponse.json({ error: 'Not enough stock for one or more sales.' }, { status: 400 })
    }

    if (error instanceof Error && error.message === 'NO_BOM') {
      return NextResponse.json(
        { error: 'One or more selected L1 items have no BOM.' },
        { status: 400 }
      )
    }

    if (error instanceof Error && error.message === 'ITEM_NOT_FOUND') {
      return NextResponse.json({ error: 'One or more selected L1 items were not found.' }, { status: 404 })
    }

    if (error instanceof Error && error.message === 'NOT_L1') {
      return NextResponse.json(
        { error: 'Sales can only be recorded for L1 dishes.' },
        { status: 400 }
      )
    }

    console.error('POST /api/sales/import/apply failed:', error)
    return NextResponse.json({ error: 'Failed to save imported sales.' }, { status: 500 })
  }
}
