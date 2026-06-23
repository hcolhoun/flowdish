import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAdmin, requireTenant, tenantErrorResponse } from '@/lib/tenant'

function positiveInt(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : fallback
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export async function GET() {
  try {
    const tenant = await requireTenant()

    if (!canAdmin(tenant.role)) {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    const [configs, claims] = await Promise.all([
      prisma.supplierCreditConfig.findMany({
        where: { restaurantId: tenant.restaurantId },
        orderBy: { supplier: 'asc' },
      }),
      prisma.supplierCreditClaim.findMany({
        where: { restaurantId: tenant.restaurantId },
        orderBy: [
          { status: 'asc' },
          { createdAt: 'desc' },
        ],
      }),
    ])

    return NextResponse.json({
      configs,
      claims,
      emailServiceConfigured: Boolean(
        process.env.RESEND_API_KEY && process.env.SUPPLIER_CREDIT_FROM_EMAIL
      ),
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/admin/supplier-credit-followups failed:', error)
    return NextResponse.json(
      { error: 'Failed to load supplier credit follow-ups.' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canAdmin(tenant.role)) {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    const body = await req.json()
    const supplier = String(body.supplier || '').trim()
    const supplierEmail = String(body.supplierEmail || '').trim().toLowerCase()
    const ccEmail = String(body.ccEmail || '').trim().toLowerCase() || null
    const enabled = Boolean(body.enabled)
    const firstFollowUpDays = positiveInt(body.firstFollowUpDays, 3)
    const repeatEveryDays = positiveInt(body.repeatEveryDays, 3)
    const maxFollowUps = positiveInt(body.maxFollowUps, 5)

    if (!supplier) {
      return NextResponse.json({ error: 'Supplier name is required.' }, { status: 400 })
    }

    if (!validEmail(supplierEmail)) {
      return NextResponse.json({ error: 'Valid supplier email is required.' }, { status: 400 })
    }

    if (ccEmail && !validEmail(ccEmail)) {
      return NextResponse.json({ error: 'CC email is not valid.' }, { status: 400 })
    }

    const existing = await prisma.supplierCreditConfig.findFirst({
      where: {
        restaurantId: tenant.restaurantId,
        supplier: {
          equals: supplier,
          mode: 'insensitive',
        },
      },
    })

    const config = existing
      ? await prisma.supplierCreditConfig.update({
          where: { id: existing.id },
          data: {
            supplier,
            supplierEmail,
            ccEmail,
            enabled,
            firstFollowUpDays,
            repeatEveryDays,
            maxFollowUps,
          },
        })
      : await prisma.supplierCreditConfig.create({
          data: {
            restaurantId: tenant.restaurantId,
            supplier,
            supplierEmail,
            ccEmail,
            enabled,
            firstFollowUpDays,
            repeatEveryDays,
            maxFollowUps,
          },
        })

    await prisma.supplierCreditClaim.updateMany({
      where: {
        restaurantId: tenant.restaurantId,
        supplier: {
          equals: supplier,
          mode: 'insensitive',
        },
        status: 'OPEN',
      },
      data: {
        nextFollowUpAt: enabled ? addDays(new Date(), firstFollowUpDays) : null,
        lastEmailError: null,
      },
    })

    return NextResponse.json({ config })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('POST /api/admin/supplier-credit-followups failed:', error)
    return NextResponse.json(
      { error: 'Failed to save supplier credit email configuration.' },
      { status: 500 }
    )
  }
}
