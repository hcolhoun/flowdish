import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'
import { isSystemOwnerEmail } from '@/lib/system-owner'

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

function validMonth(value: string | null) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null
  const month = Number(value.slice(5, 7))
  return month >= 1 && month <= 12 ? value : null
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return {
    gte: new Date(Date.UTC(year, monthNumber - 1, 1)),
    lt: new Date(Date.UTC(year, monthNumber, 1)),
  }
}

function monthOptions(firstDate: Date | null) {
  const now = new Date()
  const first = firstDate || now
  const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const months: string[] = []

  while (cursor <= end) {
    months.push(cursor.toISOString().slice(0, 7))
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  return months.reverse()
}

export async function GET(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!isSystemOwnerEmail(tenant.email)) {
      return NextResponse.json({ error: 'System owner access required.' }, { status: 403 })
    }

    const url = new URL(req.url)
    const selectedMonth = validMonth(url.searchParams.get('month')) || currentMonth()
    const earliestLog = await prisma.aiUsageLog.findFirst({
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    const logs = await prisma.aiUsageLog.findMany({
      where: { createdAt: monthRange(selectedMonth) },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            plan: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    const grouped = new Map<string, any>()

    for (const log of logs) {
      const key = `${log.restaurantId}|${log.feature}|${log.provider}|${log.model}`
      const existing =
        grouped.get(key) ||
        {
          restaurantId: log.restaurantId,
          restaurantName: log.restaurant.name,
          plan: log.restaurant.plan,
          feature: log.feature,
          provider: log.provider,
          model: log.model,
          requestCount: 0,
          promptTokens: 0,
          cachedPromptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
          missingTokenCount: 0,
          missingCostCount: 0,
          lastUsedAt: log.createdAt,
        }

      existing.requestCount += 1
      existing.promptTokens += log.promptTokens ?? 0
      existing.cachedPromptTokens += log.cachedPromptTokens ?? 0
      existing.completionTokens += log.completionTokens ?? 0
      existing.totalTokens += log.totalTokens ?? 0
      existing.estimatedCostUsd += log.estimatedCostUsd ?? 0
      if (log.totalTokens === null) existing.missingTokenCount += 1
      if (log.estimatedCostUsd === null) existing.missingCostCount += 1
      if (new Date(log.createdAt) > new Date(existing.lastUsedAt)) {
        existing.lastUsedAt = log.createdAt
      }

      grouped.set(key, existing)
    }

    return NextResponse.json({
      rows: Array.from(grouped.values()).sort((a, b) => b.totalTokens - a.totalTokens),
      selectedMonth,
      availableMonths: monthOptions(earliestLog?.createdAt ?? null),
      totalRequests: logs.length,
      totalPromptTokens: logs.reduce((sum, log) => sum + (log.promptTokens ?? 0), 0),
      totalCompletionTokens: logs.reduce(
        (sum, log) => sum + (log.completionTokens ?? 0),
        0
      ),
      totalTokens: logs.reduce((sum, log) => sum + (log.totalTokens ?? 0), 0),
      totalEstimatedCostUsd: logs.reduce(
        (sum, log) => sum + (log.estimatedCostUsd ?? 0),
        0
      ),
      missingCostCount: logs.filter((log) => log.estimatedCostUsd === null).length,
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/admin/ai-usage failed:', error)
    return NextResponse.json({ error: 'Failed to load AI usage.' }, { status: 500 })
  }
}
