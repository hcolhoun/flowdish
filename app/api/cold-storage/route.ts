import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'

export async function GET() {
  try {
    const tenant = await requireTenant()

    const monitors = await prisma.coldStorageMonitor.findMany({
      where: {
        restaurantId: tenant.restaurantId,
        active: true,
      },
      orderBy: {
        name: 'asc',
      },
      include: {
        readings: {
          orderBy: {
            recordedAt: 'desc',
          },
          take: 50,
        },
      },
    })

    return NextResponse.json({
      monitors: monitors.map((monitor) => ({
        ...monitor,
        deviceKey: undefined,
        latestReading: monitor.readings[0] ?? null,
      })),
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/cold-storage failed:', error)
    return NextResponse.json({ error: 'Failed to load cold storage.' }, { status: 500 })
  }
}
