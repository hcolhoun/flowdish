export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { buildItemDeletionPlan, type ItemDeleteMode } from '@/lib/item-deletion'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'

export async function GET(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json({ error: 'You do not have permission to delete items.' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id') || ''
    const mode = searchParams.get('mode') as ItemDeleteMode

    if (!id || !['recipe', 'item_only'].includes(mode)) {
      return NextResponse.json({ error: 'Item id and delete mode are required.' }, { status: 400 })
    }

    const plan = await buildItemDeletionPlan(prisma, tenant.restaurantId, id, mode)
    if (!plan) return NextResponse.json({ error: 'Item not found.' }, { status: 404 })
    if (plan.item.itemType !== 'L1') {
      return NextResponse.json({ error: 'Recipe deletion is available for L1 dishes only.' }, { status: 400 })
    }

    return NextResponse.json(plan)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/items/delete-preview failed:', error)
    return NextResponse.json({ error: 'Failed to prepare the delete warning.' }, { status: 500 })
  }
}
