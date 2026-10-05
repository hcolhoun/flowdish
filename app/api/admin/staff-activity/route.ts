import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAdmin, requireTenant, tenantErrorResponse } from '@/lib/tenant'
import { isSystemOwnerEmail } from '@/lib/system-owner'

const PREP_POINTS = 3
const WASTE_POINTS = 1

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
    const isSystemOwner = isSystemOwnerEmail(tenant.email)

    if (!isSystemOwner && !canAdmin(tenant.role)) {
      return NextResponse.json({ error: 'Restaurant admin access required.' }, { status: 403 })
    }

    const url = new URL(req.url)
    const selectedMonth = validMonth(url.searchParams.get('month')) || currentMonth()
    const createdAt = monthRange(selectedMonth)

    const [staffUsers, prepCounts, wasteCounts, earliestPrep, earliestWaste] = await Promise.all([
      prisma.staffUser.findMany({
        where: {
          restaurantId: tenant.restaurantId,
          isAccountPin: false,
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          displayName: true,
          username: true,
          active: true,
          createdAt: true,
        },
      }),
      prisma.prepBatch.groupBy({
        by: ['enteredByStaffUserId'],
        where: {
          restaurantId: tenant.restaurantId,
          enteredByStaffUserId: { not: null },
          createdAt,
        },
        _count: { _all: true },
      }),
      prisma.waste.groupBy({
        by: ['enteredByStaffUserId'],
        where: {
          restaurantId: tenant.restaurantId,
          enteredByStaffUserId: { not: null },
          createdAt,
        },
        _count: { _all: true },
      }),
      prisma.prepBatch.findFirst({
        where: {
          restaurantId: tenant.restaurantId,
          enteredByStaffUserId: { not: null },
        },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.waste.findFirst({
        where: {
          restaurantId: tenant.restaurantId,
          enteredByStaffUserId: { not: null },
        },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    const prepByStaff = new Map(
      prepCounts.map((row) => [row.enteredByStaffUserId, row._count._all])
    )
    const wasteByStaff = new Map(
      wasteCounts.map((row) => [row.enteredByStaffUserId, row._count._all])
    )

    const rows = staffUsers
      .map((staff) => {
        const prepEntries = prepByStaff.get(staff.id) || 0
        const wasteEntries = wasteByStaff.get(staff.id) || 0

        return {
          staffUserId: staff.id,
          displayName: staff.displayName,
          username: staff.username,
          active: staff.active,
          prepEntries,
          wasteEntries,
          totalEntries: prepEntries + wasteEntries,
          points: prepEntries * PREP_POINTS + wasteEntries * WASTE_POINTS,
        }
      })
      .sort(
        (a, b) =>
          b.points - a.points ||
          b.totalEntries - a.totalEntries ||
          a.displayName.localeCompare(b.displayName)
      )
      .map((row, index) => ({ ...row, rank: index + 1 }))

    const earliestActivityAt = [earliestPrep?.createdAt, earliestWaste?.createdAt]
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => a.getTime() - b.getTime())[0]

    return NextResponse.json({
      selectedMonth,
      availableMonths: monthOptions(earliestActivityAt || staffUsers[0]?.createdAt || null),
      pointWeights: {
        prep: PREP_POINTS,
        waste: WASTE_POINTS,
      },
      rows,
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/admin/staff-activity failed:', error)
    return NextResponse.json({ error: 'Failed to load staff activity.' }, { status: 500 })
  }
}
