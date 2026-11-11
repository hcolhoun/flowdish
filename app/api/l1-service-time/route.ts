import { NextResponse } from 'next/server'
import { aiErrorResponse } from '@/lib/ai-import'
import { calculateL1ServiceTime, getL1ServiceTimeContext } from '@/lib/l1-service-time'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'

function minutes(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 10) / 10 : null
}

function batchSize(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 1 && number <= 500
    ? Math.round(number)
    : null
}

function calculationError(error: unknown) {
  if (!(error instanceof Error)) return null

  if (error.message === 'L1_NOT_FOUND') {
    return NextResponse.json({ error: 'L1 dish not found.' }, { status: 404 })
  }

  return null
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to calculate service times.' },
        { status: 403 }
      )
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: tenant.restaurantId },
      select: { labourCostingEnabled: true },
    })

    if (!restaurant?.labourCostingEnabled) {
      return NextResponse.json(
        { error: 'Enable labour costing in Admin before calculating L1 service time.' },
        { status: 400 }
      )
    }

    const body = await req.json()
    const itemId = String(body.itemId || '').trim()

    if (!itemId) {
      return NextResponse.json({ error: 'Missing L1 item id.' }, { status: 400 })
    }

    return NextResponse.json(
      await calculateL1ServiceTime(tenant.restaurantId, itemId)
    )
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    const aiError = aiErrorResponse(error)
    if (aiError) return aiError

    const knownError = calculationError(error)
    if (knownError) return knownError

    console.error('POST /api/l1-service-time failed:', error)
    return NextResponse.json({ error: 'Failed to calculate L1 service time.' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to confirm service times.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const itemId = String(body.itemId || '').trim()
    const serviceBatchSize = batchSize(body.batchSize)
    const setupMinutes = minutes(body.setupMinutes)
    const activeServiceMinutes = minutes(body.activeServiceMinutes)
    const cleanupMinutes = minutes(body.cleanupMinutes)
    const passiveMinutes = minutes(body.passiveMinutes)

    if (!itemId) {
      return NextResponse.json({ error: 'Missing L1 item id.' }, { status: 400 })
    }

    if (serviceBatchSize === null) {
      return NextResponse.json(
        { error: 'Service batch size must be between 1 and 500 portions.' },
        { status: 400 }
      )
    }

    if (
      setupMinutes === null ||
      activeServiceMinutes === null ||
      cleanupMinutes === null ||
      passiveMinutes === null
    ) {
      return NextResponse.json(
        { error: 'All service-time fields must be zero or greater.' },
        { status: 400 }
      )
    }

    const { item, fingerprint } = await getL1ServiceTimeContext(
      tenant.restaurantId,
      itemId
    )

    if (!item.serviceTimeFingerprint || item.serviceTimeFingerprint !== fingerprint) {
      return NextResponse.json(
        { error: 'The recipe or SOP changed. Recalculate service time before confirming it.' },
        { status: 400 }
      )
    }

    const handsOnMinutes = Math.round(
      (setupMinutes + activeServiceMinutes + cleanupMinutes) * 10
    ) / 10
    const elapsedMinutes = Math.round((handsOnMinutes + passiveMinutes) * 10) / 10
    const assumptions = Array.isArray(body.assumptions)
      ? body.assumptions.map((value: unknown) => String(value).trim()).filter(Boolean).slice(0, 12)
      : []

    const updated = await prisma.item.update({
      where: { id: itemId },
      data: {
        serviceBatchSize,
        serviceSetupMinutes: setupMinutes,
        serviceActiveMinutes: activeServiceMinutes,
        serviceCleanupMinutes: cleanupMinutes,
        servicePassiveMinutes: passiveMinutes,
        serviceHandsOnMinutes: handsOnMinutes,
        serviceElapsedMinutes: elapsedMinutes,
        serviceTimeAssumptions: assumptions,
        serviceTimeStatus: 'CONFIRMED',
        serviceTimeConfirmedAt: new Date(),
        serviceTimeConfirmedBy: tenant.email,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    const knownError = calculationError(error)
    if (knownError) return knownError

    console.error('PATCH /api/l1-service-time failed:', error)
    return NextResponse.json({ error: 'Failed to confirm L1 service time.' }, { status: 500 })
  }
}
