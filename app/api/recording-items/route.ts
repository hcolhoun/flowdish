import { NextResponse } from 'next/server'
import {
  kitchenAccessErrorResponse,
  requireKitchenAccess,
} from '@/lib/kitchen-access'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const access = await requireKitchenAccess()

    const items = await prisma.item.findMany({
      where: {
        restaurantId: access.restaurantId,
        itemType: {
          in: ['L2', 'L3'],
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(items)
  } catch (error) {
    const accessError = kitchenAccessErrorResponse(error)
    if (accessError) return accessError

    console.error('GET /api/recording-items failed:', error)
    return NextResponse.json({ error: 'Failed to load recording items' }, { status: 500 })
  }
}
