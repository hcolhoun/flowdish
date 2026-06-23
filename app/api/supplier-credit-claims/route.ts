import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export async function GET() {
  try {
    const tenant = await requireTenant()

    const claims = await prisma.supplierCreditClaim.findMany({
      where: {
        restaurantId: tenant.restaurantId,
      },
      orderBy: [
        { status: 'asc' },
        { createdAt: 'desc' },
      ],
    })

    return NextResponse.json({ claims })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/supplier-credit-claims failed:', error)
    return NextResponse.json({ error: 'Failed to load supplier credit claims.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to record supplier credit claims.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const supplier = String(body.supplier || '').trim()
    const productName = String(body.productName || '').trim()
    const supplierSku = String(body.supplierSku || '').trim() || null
    const docketNumber = String(body.docketNumber || '').trim() || null
    const notes = String(body.notes || '').trim() || null
    const unitType = ['g', 'ml', 'each'].includes(body.unitType) ? body.unitType : null
    const chargedAt = body.chargedAt ? new Date(body.chargedAt) : new Date()

    if (!supplier) {
      return NextResponse.json({ error: 'Supplier is required.' }, { status: 400 })
    }

    if (!productName) {
      return NextResponse.json({ error: 'Product name is required.' }, { status: 400 })
    }

    if (Number.isNaN(chargedAt.getTime())) {
      return NextResponse.json({ error: 'Valid docket date is required.' }, { status: 400 })
    }

    const config = await prisma.supplierCreditConfig.findFirst({
      where: {
        restaurantId: tenant.restaurantId,
        supplier: {
          equals: supplier,
          mode: 'insensitive',
        },
        enabled: true,
      },
    })

    const claim = await prisma.supplierCreditClaim.create({
      data: {
        restaurantId: tenant.restaurantId,
        supplier,
        supplierSku,
        productName,
        qty: nullableNumber(body.qty),
        unitType,
        chargedAmount: nullableNumber(body.chargedAmount),
        docketNumber,
        chargedAt,
        notes,
        nextFollowUpAt: config
          ? addDays(new Date(), config.firstFollowUpDays)
          : null,
        createdByName: tenant.email || 'Chef',
        createdByEmail: tenant.email,
      },
    })

    return NextResponse.json({
      claim,
      automationConfigured: Boolean(config),
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('POST /api/supplier-credit-claims failed:', error)
    return NextResponse.json(
      { error: 'Failed to record charged but not received item.' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to update supplier credit claims.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const id = String(body.id || '').trim()
    const status = body.status

    if (!id) {
      return NextResponse.json({ error: 'Claim id is required.' }, { status: 400 })
    }

    if (!['OPEN', 'CREDIT_RECEIVED', 'CLOSED'].includes(status)) {
      return NextResponse.json({ error: 'Valid claim status is required.' }, { status: 400 })
    }

    const existing = await prisma.supplierCreditClaim.findFirst({
      where: {
        id,
        restaurantId: tenant.restaurantId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Supplier credit claim not found.' }, { status: 404 })
    }

    const config =
      status === 'OPEN'
        ? await prisma.supplierCreditConfig.findFirst({
            where: {
              restaurantId: tenant.restaurantId,
              supplier: {
                equals: existing.supplier,
                mode: 'insensitive',
              },
              enabled: true,
            },
          })
        : null

    const updated = await prisma.supplierCreditClaim.update({
      where: { id },
      data: {
        status,
        nextFollowUpAt:
          status === 'OPEN' && config
            ? addDays(new Date(), config.firstFollowUpDays)
            : null,
        lastEmailError: status === 'OPEN' ? null : existing.lastEmailError,
      },
    })

    return NextResponse.json({ claim: updated })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('PATCH /api/supplier-credit-claims failed:', error)
    return NextResponse.json({ error: 'Failed to update supplier credit claim.' }, { status: 500 })
  }
}
