import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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

async function generateForecastName() {
  const countToday = await prisma.forecast.count({
    where: {
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
    const forecasts = await prisma.forecast.findMany({
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
    console.error('GET /api/forecasts failed:', error)
    return NextResponse.json({ error: 'Failed to load forecasts' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const suppliedName = String(body.name || '').trim()
    const name = suppliedName || (await generateForecastName())

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

    const forecast = await prisma.forecast.create({
      data: {
        name,
        startDate,
        endDate,
        lines: {
          create: validLines,
        },
      },
      include: {
        lines: {
          include: { item: true },
        },
      },
    })

    return NextResponse.json(forecast)
  } catch (error) {
    console.error('POST /api/forecasts failed:', error)
    return NextResponse.json({ error: 'Failed to save forecast' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing forecast id' }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.forecastLine.deleteMany({
        where: { forecastId: id },
      })

      await tx.forecast.delete({
        where: { id },
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/forecasts failed:', error)
    return NextResponse.json(
      { error: 'Failed to delete forecast' },
      { status: 500 }
    )
  }
}