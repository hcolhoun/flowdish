import { NextResponse } from 'next/server'
import { calculateL2PrepTime } from '@/lib/l2-prep-time'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'

export async function POST() {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to calculate prep times.' },
        { status: 403 }
      )
    }

    const candidates = await prisma.item.findMany({
      where: {
        restaurantId: tenant.restaurantId,
        itemType: 'L2',
        prepTimeStatus: {
          in: ['MISSING', 'STALE'],
        },
        standardBatchOutput: {
          gt: 0,
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 5,
    })

    const calculated: string[] = []
    const failed: Array<{ itemId: string; name: string; error: string }> = []

    for (const item of candidates) {
      try {
        await calculateL2PrepTime(tenant.restaurantId, item.id)
        calculated.push(item.id)
      } catch (error) {
        failed.push({
          itemId: item.id,
          name: item.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    const remaining = await prisma.item.count({
      where: {
        restaurantId: tenant.restaurantId,
        itemType: 'L2',
        prepTimeStatus: {
          in: ['MISSING', 'STALE'],
        },
      },
    })

    return NextResponse.json({
      attempted: candidates.length,
      calculated: calculated.length,
      failed,
      remaining,
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('POST /api/l2-prep-time/bulk failed:', error)
    return NextResponse.json(
      { error: 'Failed to calculate missing L2 prep times.' },
      { status: 500 }
    )
  }
}
