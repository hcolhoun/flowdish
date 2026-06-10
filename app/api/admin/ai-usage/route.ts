import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'
import { isSystemOwnerEmail } from '@/lib/system-owner'

export async function GET(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!isSystemOwnerEmail(tenant.email)) {
      return NextResponse.json({ error: 'System owner access required.' }, { status: 403 })
    }

    const url = new URL(req.url)
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')
    const where: any = {}

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(`${startDate}T00:00:00.000Z`)
      if (endDate) where.createdAt.lte = new Date(`${endDate}T23:59:59.999Z`)
    }

    const logs = await prisma.aiUsageLog.findMany({
      where,
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
      const key = `${log.restaurantId}|${log.feature}|${log.model}`
      const existing =
        grouped.get(key) ||
        {
          restaurantId: log.restaurantId,
          restaurantName: log.restaurant.name,
          plan: log.restaurant.plan,
          feature: log.feature,
          model: log.model,
          requestCount: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          missingTokenCount: 0,
          lastUsedAt: log.createdAt,
        }

      existing.requestCount += 1
      existing.promptTokens += log.promptTokens ?? 0
      existing.completionTokens += log.completionTokens ?? 0
      existing.totalTokens += log.totalTokens ?? 0
      if (log.totalTokens === null) existing.missingTokenCount += 1
      if (new Date(log.createdAt) > new Date(existing.lastUsedAt)) {
        existing.lastUsedAt = log.createdAt
      }

      grouped.set(key, existing)
    }

    return NextResponse.json({
      rows: Array.from(grouped.values()).sort((a, b) => b.totalTokens - a.totalTokens),
      totalRequests: logs.length,
      totalTokens: logs.reduce((sum, log) => sum + (log.totalTokens ?? 0), 0),
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/admin/ai-usage failed:', error)
    return NextResponse.json({ error: 'Failed to load AI usage.' }, { status: 500 })
  }
}
