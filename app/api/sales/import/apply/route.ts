import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'
import { consumeInventoryForItem, recordL1Sale, returnInventoryForItem } from '@/lib/sales-recording'

type IncomingRow = {
  itemId?: string
  qty?: number | string
  selected?: boolean
}

type IncomingModifierRow = {
  itemId?: string
  qty?: number | string
  modifierType?: string
  sourceCode?: string
  sourceName?: string
  notes?: string
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
    const modifierRows = Array.isArray(body.modifierRows)
      ? (body.modifierRows as IncomingModifierRow[])
      : []

    if (Number.isNaN(soldAt.getTime())) {
      return NextResponse.json({ error: 'Valid sold date is required.' }, { status: 400 })
    }

    const selectedRows = rows.filter((row) => row.selected !== false)
    const selectedModifierRows = modifierRows.filter((row) => row.selected !== false)

    if (selectedRows.length === 0 && selectedModifierRows.length === 0) {
      return NextResponse.json({ error: 'No selected sales or modifier rows to save.' }, { status: 400 })
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

    const invalidModifierRows = selectedModifierRows.filter((row) => {
      const qty = Number(row.qty)
      return !row.itemId || !Number.isFinite(qty) || qty <= 0
    })

    if (invalidModifierRows.length > 0) {
      return NextResponse.json(
        { error: `${invalidModifierRows.length} selected modifier row(s) need an item and quantity.` },
        { status: 400 }
      )
    }

    const result = await prisma.$transaction(async (tx: any) => {
      const saved = []
      const savedModifiers = []

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

      for (const row of selectedModifierRows) {
        const item = await tx.item.findFirst({
          where: {
            id: String(row.itemId),
            restaurantId: tenant.restaurantId,
          },
        })

        if (!item) throw new Error('ITEM_NOT_FOUND')

        const modifierType = row.modifierType === 'REMOVE' ? 'REMOVE' : 'EXTRA'
        const qty = Number(row.qty)
        const qtyDelta = modifierType === 'REMOVE' ? -qty : qty
        let cost = 0

        if (item.itemType === 'L1') {
          if (modifierType === 'REMOVE') {
            throw new Error('NEGATIVE_L1_MODIFIER_NOT_SUPPORTED')
          }

          const sale = await recordL1Sale({
            tx,
            restaurantId: tenant.restaurantId,
            itemId: item.id,
            soldAt,
            qty,
          })
          cost = sale.cost
        } else if (modifierType === 'EXTRA') {
          cost = await consumeInventoryForItem({
            tx,
            restaurantId: tenant.restaurantId,
            itemId: item.id,
            qty,
          })
        } else {
          await returnInventoryForItem({
            tx,
            restaurantId: tenant.restaurantId,
            itemId: item.id,
            qty,
          })
        }

        savedModifiers.push(
          await tx.salesModifierAdjustment.create({
            data: {
              restaurantId: tenant.restaurantId,
              soldAt,
              itemId: item.id,
              qtyDelta,
              cost,
              sourceCode: String(row.sourceCode || '').trim() || null,
              sourceName: String(row.sourceName || '').trim() || null,
              modifierType,
              notes: String(row.notes || '').trim() || null,
            },
            include: {
              item: true,
            },
          })
        )
      }

      return {
        sales: saved,
        modifiers: savedModifiers,
      }
    })

    return NextResponse.json({
      success: true,
      savedCount: result.sales.length,
      savedModifierCount: result.modifiers.length,
      sales: result.sales,
      modifiers: result.modifiers,
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

    if (error instanceof Error && error.message === 'NEGATIVE_L1_MODIFIER_NOT_SUPPORTED') {
      return NextResponse.json(
        { error: 'Removed/no modifiers should be matched to an L2 or L3 stock item, not an L1 dish.' },
        { status: 400 }
      )
    }

    console.error('POST /api/sales/import/apply failed:', error)
    return NextResponse.json({ error: 'Failed to save imported sales.' }, { status: 500 })
  }
}
