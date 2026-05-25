import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'
import { isSystemOwnerEmail } from '@/lib/system-owner'

const TEMPLATE_RESTAURANT_ID = 'flowdish_admin_live'

export async function GET() {
  try {
    const tenant = await requireTenant()

    if (!isSystemOwnerEmail(tenant.email)) {
      return NextResponse.json(
        { error: 'Only System Owners can view template menus.' },
        { status: 403 }
      )
    }

    const l0Items = await prisma.item.findMany({
      where: {
        restaurantId: TEMPLATE_RESTAURANT_ID,
        itemType: 'L0',
      },
      orderBy: {
        name: 'asc',
      },
    })

    const l0Links = await prisma.bomL0L1.findMany({
      where: {
        restaurantId: TEMPLATE_RESTAURANT_ID,
        l0ItemId: {
          in: l0Items.map((item) => item.id),
        },
      },
    })

    const countByL0 = new Map<string, number>()

    for (const link of l0Links) {
      countByL0.set(link.l0ItemId, (countByL0.get(link.l0ItemId) ?? 0) + 1)
    }

    return NextResponse.json({
      templateRestaurantId: TEMPLATE_RESTAURANT_ID,
      l0Menus: l0Items.map((item) => ({
        id: item.id,
        sku: item.sku,
        name: item.name,
        unitType: item.unitType,
        sellingPrice: item.sellingPrice,
        l1Count: countByL0.get(item.id) ?? 0,
      })),
    })
  } catch (error) {
    const tenantResponse = tenantErrorResponse(error)

    if (tenantResponse) {
      return tenantResponse
    }

    console.error('GET /api/admin/template-l0s failed:', error)

    return NextResponse.json(
      { error: 'Failed to load template L0 menus.' },
      { status: 500 }
    )
  }
}