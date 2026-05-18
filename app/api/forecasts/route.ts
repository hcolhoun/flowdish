import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'

function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function startOfTomorrow() {
  const start = startOfToday()
  return new Date(start.getTime() + 24 * 60 * 60 * 1000)
}

function dateStamp() {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

async function generateForecastName(restaurantId: string) {
  const countToday = await prisma.forecast.count({
    where: {
      restaurantId,
      createdAt: {
        gte: startOfToday(),
        lt: startOfTomorrow(),
      },
    },
  })

  return `Forecast ${dateStamp()} #${countToday + 1}`
}

export async function GET() {
  try {
    const tenant = await requireTenant()

    const forecasts = await prisma.forecast.findMany({
      where: {
        restaurantId: tenant.restaurantId,
      },
      include: {
        lines: {
          include: {
            item: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(forecasts)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/forecasts failed:', error)
    return NextResponse.json({ error: 'Failed to load forecasts' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to create forecasts.' },
        { status: 403 }
      )
    }

    const body = await req.json()

    const suppliedName = String(body.name || '').trim()
    const name = suppliedName || (await generateForecastName(tenant.restaurantId))

    const startDate = new Date(body.startDate)
    const endDate = new Date(body.endDate)
    const lines = Array.isArray(body.lines) ? body.lines : []

    if (Number.isNaN(startDate.getTime())) {
      return NextResponse.json({ error: 'Valid start date is required' }, { status: 400 })
    }

    if (Number.isNaN(endDate.getTime())) {
      return NextResponse.json({ error: 'Valid end date is required' }, { status: 400 })
    }

    const validLines = lines
      .filter((line: any) => line.itemId && Number(line.qty) > 0)
      .map((line: any) => ({
        itemId: String(line.itemId),
        qty: Number(line.qty),
      }))

    if (validLines.length === 0) {
      return NextResponse.json(
        { error: 'Add at least one valid forecast line.' },
        { status: 400 }
      )
    }

    const itemIds = validLines.map((line: any) => line.itemId)

    const validItems = await prisma.item.findMany({
      where: {
        restaurantId: tenant.restaurantId,
        id: { in: itemIds },
      },
      select: {
        id: true,
      },
    })

    const validItemIds = new Set(validItems.map((item) => item.id))

    const invalidLine = validLines.find((line: any) => !validItemIds.has(line.itemId))

    if (invalidLine) {
      return NextResponse.json(
        { error: 'One or more forecast items do not belong to this restaurant.' },
        { status: 400 }
      )
    }

    const forecast = await prisma.$transaction(async (tx: any) => {
      const createdForecast = await tx.forecast.create({
        data: {
          restaurantId: tenant.restaurantId,
          name,
          startDate,
          endDate,
        },
      })

      await tx.forecastLine.createMany({
        data: validLines.map((line: any) => ({
          restaurantId: tenant.restaurantId,
          forecastId: createdForecast.id,
          itemId: line.itemId,
          qty: line.qty,
        })),
      })

      return tx.forecast.findFirst({
        where: {
          id: createdForecast.id,
          restaurantId: tenant.restaurantId,
        },
        include: {
          lines: {
            include: { item: true },
          },
        },
      })
    })

    return NextResponse.json(forecast)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('POST /api/forecasts failed:', error)
    return NextResponse.json({ error: 'Failed to save forecast' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to delete forecasts.' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing forecast id' }, { status: 400 })
    }

    const forecast = await prisma.forecast.findFirst({
      where: {
        id,
        restaurantId: tenant.restaurantId,
      },
    })

    if (!forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.forecastLine.deleteMany({
        where: {
          restaurantId: tenant.restaurantId,
          forecastId: forecast.id,
        },
      })

      await tx.forecast.delete({
        where: {
          id: forecast.id,
        },
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('DELETE /api/forecasts failed:', error)
    return NextResponse.json({ error: 'Failed to delete forecast' }, { status: 500 })
  }
}