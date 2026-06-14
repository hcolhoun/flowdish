export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'

function cleanText(value: unknown) {
  return String(value ?? '').trim()
}

function toNumber(value: unknown) {
  const text = cleanText(value)
  if (!text || text === '--') return null

  const number = Number(text.replace(/[^\d.-]/g, ''))
  return Number.isFinite(number) ? number : null
}

function normaliseHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function valueByHeader(row: Record<string, unknown>, candidates: string[]) {
  const normalisedCandidates = new Set(candidates.map(normaliseHeader))
  const match = Object.entries(row).find(([key]) => normalisedCandidates.has(normaliseHeader(key)))
  return match?.[1]
}

function parseEwelinkDateTime(dateValue: unknown, timeValue: unknown) {
  const dateText = cleanText(dateValue)
  const timeText = cleanText(timeValue)

  if (!dateText || !timeText) return null

  const match = dateText.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (!match) return null

  const [, year, month, day] = match
  const normalisedTime = timeText.length === 5 ? `${timeText}:00` : timeText
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(normalisedTime.slice(0, 2)),
    Number(normalisedTime.slice(3, 5)),
    Number(normalisedTime.slice(6, 8) || 0)
  )

  return Number.isNaN(date.getTime()) ? null : date
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to import cold storage readings.' },
        { status: 403 }
      )
    }

    const formData = await req.formData()
    const monitorId = cleanText(formData.get('monitorId'))
    const file = formData.get('file')

    if (!monitorId || !(file instanceof File)) {
      return NextResponse.json({ error: 'Choose a monitor and eWeLink history file.' }, { status: 400 })
    }

    const monitor = await prisma.coldStorageMonitor.findFirst({
      where: {
        id: monitorId,
        restaurantId: tenant.restaurantId,
        active: true,
      },
    })

    if (!monitor) {
      return NextResponse.json({ error: 'Cold storage monitor not found.' }, { status: 404 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false })
    const firstSheetName = workbook.SheetNames[0]

    if (!firstSheetName) {
      return NextResponse.json({ error: 'No sheets found in eWeLink history file.' }, { status: 400 })
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheetName], {
      defval: '',
      raw: false,
    })

    let parsedCount = 0
    let skippedCount = 0
    let duplicateCount = 0
    let importedCount = 0

    for (const row of rows) {
      const recordedAt = parseEwelinkDateTime(
        valueByHeader(row, ['date']),
        valueByHeader(row, ['time'])
      )
      const temperatureC = toNumber(
        valueByHeader(row, ['Temperature', 'Temperature C', 'Temperature Celsius'])
      )
      const humidity = toNumber(valueByHeader(row, ['Humidity', 'Humidity RH']))

      if (!recordedAt || temperatureC === null) {
        skippedCount += 1
        continue
      }

      parsedCount += 1

      const existing = await prisma.coldStorageReading.findFirst({
        where: {
          monitorId: monitor.id,
          recordedAt,
        },
      })

      if (existing) {
        duplicateCount += 1
        continue
      }

      await prisma.coldStorageReading.create({
        data: {
          restaurantId: tenant.restaurantId,
          monitorId: monitor.id,
          temperatureC,
          humidity,
          source: 'ewelink-history-import',
          recordedAt,
        },
      })

      importedCount += 1
    }

    return NextResponse.json({
      success: true,
      summary: {
        sourceRows: rows.length,
        parsedCount,
        importedCount,
        duplicateCount,
        skippedCount,
      },
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('POST /api/cold-storage/import-ewelink-history failed:', error)
    return NextResponse.json({ error: 'Failed to import eWeLink history.' }, { status: 500 })
  }
}
