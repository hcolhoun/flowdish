export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { aiErrorResponse, cleanText, parseJsonWithDeepSeek } from '@/lib/ai-import'
import { prisma } from '@/lib/prisma'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'

type BriefingAction = {
  priority: 'urgent' | 'attention' | 'routine'
  title: string
  detail: string
  href: string
}

type BriefingResult = {
  summary: string
  actions: BriefingAction[]
}

const ALLOWED_LINKS = new Set([
  '/cold-storage',
  '/inventory',
  '/planning',
  '/prep',
  '/deliveries',
  '/waste',
])

function cleanBriefing(result: BriefingResult) {
  const actions = Array.isArray(result.actions)
    ? result.actions
        .map((action) => ({
          priority: ['urgent', 'attention', 'routine'].includes(action.priority)
            ? action.priority
            : ('routine' as const),
          title: cleanText(action.title)?.slice(0, 90) || '',
          detail: cleanText(action.detail)?.slice(0, 280) || '',
          href: ALLOWED_LINKS.has(action.href) ? action.href : '/',
        }))
        .filter((action) => action.title && action.detail)
        .slice(0, 6)
    : []

  return {
    summary: cleanText(result.summary)?.slice(0, 300) || 'No urgent kitchen actions found.',
    actions,
  }
}

export async function POST() {
  try {
    const tenant = await requireTenant()
    const now = new Date()
    const inThreeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1)

    const [inventoryLots, l2Items, forecasts, monitors, recentPrep] = await Promise.all([
      prisma.inventoryLot.findMany({
        where: {
          restaurantId: tenant.restaurantId,
          qtyRemaining: { gt: 0 },
          expiryAt: { lte: inThreeDays },
        },
        include: { item: true },
        orderBy: { expiryAt: 'asc' },
        take: 25,
      }),
      prisma.item.findMany({
        where: { restaurantId: tenant.restaurantId, itemType: 'L2' },
        select: { id: true, sku: true, name: true, unitType: true },
        orderBy: { name: 'asc' },
      }),
      prisma.forecast.findMany({
        where: {
          restaurantId: tenant.restaurantId,
          startDate: { lte: endOfToday },
          endDate: { gte: startOfToday },
        },
        include: { lines: { include: { item: true } } },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
      prisma.coldStorageMonitor.findMany({
        where: { restaurantId: tenant.restaurantId, active: true },
        include: { readings: { orderBy: { recordedAt: 'desc' }, take: 1 } },
        orderBy: { name: 'asc' },
      }),
      prisma.prepBatch.findMany({
        where: { restaurantId: tenant.restaurantId, preparedAt: { gte: twoDaysAgo } },
        include: { item: true, haccpRecord: true },
        orderBy: { preparedAt: 'desc' },
        take: 50,
      }),
    ])

    const l2Lots = await prisma.inventoryLot.groupBy({
      by: ['itemId'],
      where: {
        restaurantId: tenant.restaurantId,
        itemId: { in: l2Items.map((item) => item.id) },
        qtyRemaining: { gt: 0 },
      },
      _sum: { qtyRemaining: true },
    })
    const l2Stock = new Map(l2Lots.map((row) => [row.itemId, row._sum.qtyRemaining || 0]))

    const context = {
      generatedAt: now.toISOString(),
      expiringWithinThreeDays: inventoryLots.map((lot) => ({
        item: lot.item.name,
        sku: lot.item.sku,
        quantity: lot.qtyRemaining,
        unit: lot.unitType,
        expiry: lot.expiryAt?.toISOString() || null,
      })),
      zeroStockPrepItems: l2Items
        .filter((item) => !l2Stock.get(item.id))
        .slice(0, 20)
        .map((item) => ({ item: item.name, sku: item.sku, unit: item.unitType })),
      activeForecasts: forecasts.map((forecast) => ({
        name: forecast.name,
        startDate: forecast.startDate.toISOString(),
        endDate: forecast.endDate.toISOString(),
        dishes: forecast.lines.slice(0, 30).map((line) => ({
          item: line.item.name,
          quantity: line.qty,
        })),
      })),
      coldStorage: monitors.map((monitor) => {
        const latest = monitor.readings[0] || null
        const isStale = !latest || now.getTime() - latest.recordedAt.getTime() > 6 * 60 * 60 * 1000
        const isOutsideRange = Boolean(
          latest &&
            ((monitor.minTempC !== null && latest.temperatureC < monitor.minTempC) ||
              (monitor.maxTempC !== null && latest.temperatureC > monitor.maxTempC))
        )

        return {
          monitor: monitor.name,
          location: monitor.location,
          latestTemperatureC: latest?.temperatureC ?? null,
          recordedAt: latest?.recordedAt.toISOString() ?? null,
          minimumC: monitor.minTempC,
          maximumC: monitor.maxTempC,
          isStale,
          isOutsideRange,
        }
      }),
      incompleteEnabledHaccpChecks: recentPrep
        .filter((batch) => {
          const record = batch.haccpRecord
          if (!record) return false
          return Boolean(
            (record.cookingEnabled &&
              (!record.cookingStartedAt ||
                !record.cookingFinishedAt ||
                record.cookingCoreTempC === null)) ||
              (record.coolingEnabled && !record.coolingIntoFridgeAt) ||
              (record.reheatingEnabled && record.reheatingCoreTempC === null) ||
              (record.hotHoldEnabled &&
                (!record.hotHoldStartedAt || record.hotHoldCoreTemp1C === null))
          )
        })
        .slice(0, 20)
        .map((batch) => ({
          item: batch.item.name,
          preparedAt: batch.preparedAt.toISOString(),
        })),
    }

    const prompt = `
You are preparing a short start-of-shift briefing for a professional kitchen chef.

Use only the supplied kitchen data. Do not invent a problem, legal requirement, stock quantity, deadline, or temperature. Prioritise food-safety exceptions, missing enabled HACCP checks, refrigeration readings outside limits, imminent expiry, current forecasts, and zero-stock prep items. If the supplied data contains no actions, say so plainly.

Return ONLY valid JSON in this exact shape:
{
  "summary": "one short sentence",
  "actions": [
    {
      "priority": "urgent" | "attention" | "routine",
      "title": "short action title",
      "detail": "specific explanation using the supplied data",
      "href": "/cold-storage" | "/inventory" | "/planning" | "/prep" | "/deliveries" | "/waste"
    }
  ]
}

Return no more than six actions. Kitchen data:
${JSON.stringify(context)}
`

    const briefing = await parseJsonWithDeepSeek<BriefingResult>({
      restaurantId: tenant.restaurantId,
      feature: 'dashboard_briefing',
      prompt,
      qualityCheck: (value) => Boolean(cleanText(value.summary)) && Array.isArray(value.actions),
    })

    return NextResponse.json({ briefing: cleanBriefing(briefing), generatedAt: now.toISOString() })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    const aiError = aiErrorResponse(error)
    if (aiError) return aiError

    console.error('POST /api/dashboard-briefing failed:', error)
    return NextResponse.json({ error: 'Failed to prepare the kitchen briefing.' }, { status: 500 })
  }
}
