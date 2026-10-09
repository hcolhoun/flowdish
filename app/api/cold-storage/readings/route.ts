import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'

const PAGE_SIZE = 100

function pageFromRequest(req: Request) {
  const value = Number(new URL(req.url).searchParams.get('page') || '1')
  return Number.isInteger(value) && value > 0 ? value : 1
}

export async function GET(req: Request) {
  try {
    const tenant = await requireTenant()
    const requestedPage = pageFromRequest(req)
    const where = { restaurantId: tenant.restaurantId }

    const total = await prisma.coldStorageReading.count({ where })
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const page = Math.min(requestedPage, totalPages)
    const readings = await prisma.coldStorageReading.findMany({
      where,
      orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        monitor: {
          select: {
            name: true,
            location: true,
          },
        },
      },
    })

    return NextResponse.json({
      readings: readings.map((reading) => ({
        id: reading.id,
        temperatureC: reading.temperatureC,
        humidity: reading.humidity,
        source: reading.source,
        recordedAt: reading.recordedAt,
        createdAt: reading.createdAt,
        monitorName: reading.monitor.name,
        location: reading.monitor.location,
      })),
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages,
      },
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/cold-storage/readings failed:', error)
    return NextResponse.json({ error: 'Failed to load cold storage readings.' }, { status: 500 })
  }
}
