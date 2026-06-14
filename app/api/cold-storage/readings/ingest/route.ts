import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null

  const number = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(number) ? number : null
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const deviceKey = String(body.deviceKey || '').trim()

    if (!deviceKey) {
      return NextResponse.json({ error: 'Missing device key.' }, { status: 401 })
    }

    const monitor = await prisma.coldStorageMonitor.findUnique({
      where: {
        deviceKey,
      },
    })

    if (!monitor || !monitor.active) {
      return NextResponse.json({ error: 'Unknown or inactive monitor.' }, { status: 401 })
    }

    const temperatureC =
      toNumber(body.temperatureC) ?? toNumber(body.temperature) ?? toNumber(body.temp)
    const humidity = toNumber(body.humidity)
    const recordedAt = body.recordedAt ? new Date(body.recordedAt) : new Date()

    if (temperatureC === null) {
      return NextResponse.json({ error: 'Missing temperature.' }, { status: 400 })
    }

    if (Number.isNaN(recordedAt.getTime())) {
      return NextResponse.json({ error: 'Invalid recordedAt timestamp.' }, { status: 400 })
    }

    const reading = await prisma.coldStorageReading.create({
      data: {
        restaurantId: monitor.restaurantId,
        monitorId: monitor.id,
        temperatureC,
        humidity,
        source: body.source ? String(body.source).slice(0, 80) : 'sonoff',
        recordedAt,
      },
    })

    return NextResponse.json({ success: true, reading })
  } catch (error) {
    console.error('POST /api/cold-storage/readings/ingest failed:', error)
    return NextResponse.json({ error: 'Failed to record temperature.' }, { status: 500 })
  }
}
