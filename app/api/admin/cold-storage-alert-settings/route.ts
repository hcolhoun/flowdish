import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAdmin, requireTenant, tenantErrorResponse } from '@/lib/tenant'
import { isEmail, parseEmailList } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const tenant = await requireTenant()

    if (!canAdmin(tenant.role)) {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: {
        id: tenant.restaurantId,
      },
      select: {
        coldStorageAlertsEnabled: true,
        coldStorageAlertEmails: true,
      },
    })

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 })
    }

    const monitors = await prisma.coldStorageMonitor.findMany({
      where: {
        restaurantId: tenant.restaurantId,
        active: true,
      },
      orderBy: {
        name: 'asc',
      },
      select: {
        id: true,
        name: true,
        location: true,
        storageType: true,
        deviceKey: true,
        minTempC: true,
        maxTempC: true,
      },
    })

    return NextResponse.json({
      enabled: restaurant.coldStorageAlertsEnabled,
      emails: restaurant.coldStorageAlertEmails || '',
      monitors,
      webhookUrl: 'https://www.flowdish.ie/api/cold-storage/alerts/ifttt',
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/admin/cold-storage-alert-settings failed:', error)
    return NextResponse.json({ error: 'Failed to load cold storage alert settings.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canAdmin(tenant.role)) {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    const body = await req.json()
    const enabled = Boolean(body.enabled)
    const emails = parseEmailList(String(body.emails || ''))
    const invalidEmails = emails.filter((email) => !isEmail(email))

    if (invalidEmails.length > 0) {
      return NextResponse.json(
        { error: `Check these email addresses: ${invalidEmails.join(', ')}` },
        { status: 400 }
      )
    }

    if (enabled && emails.length === 0) {
      return NextResponse.json(
        { error: 'Add at least one email address before enabling alerts.' },
        { status: 400 }
      )
    }

    const restaurant = await prisma.restaurant.update({
      where: {
        id: tenant.restaurantId,
      },
      data: {
        coldStorageAlertsEnabled: enabled,
        coldStorageAlertEmails: emails.join(', '),
      },
      select: {
        coldStorageAlertsEnabled: true,
        coldStorageAlertEmails: true,
      },
    })

    return NextResponse.json({
      success: true,
      enabled: restaurant.coldStorageAlertsEnabled,
      emails: restaurant.coldStorageAlertEmails || '',
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('POST /api/admin/cold-storage-alert-settings failed:', error)
    return NextResponse.json({ error: 'Failed to save cold storage alert settings.' }, { status: 500 })
  }
}
