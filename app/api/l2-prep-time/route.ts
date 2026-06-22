import { NextResponse } from 'next/server'
import { aiErrorResponse } from '@/lib/ai-import'
import { calculateL2PrepTime, getL2PrepTimeContext } from '@/lib/l2-prep-time'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'

function minutes(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 10) / 10 : null
}

function calculationError(error: unknown) {
  if (!(error instanceof Error)) return null

  if (error.message === 'L2_NOT_FOUND') {
    return NextResponse.json({ error: 'L2 item not found.' }, { status: 404 })
  }

  if (error.message === 'L2_BATCH_OUTPUT_REQUIRED') {
    return NextResponse.json(
      { error: 'Save a standard batch output before calculating prep time.' },
      { status: 400 }
    )
  }

  if (error.message === 'L2_BOM_REQUIRED') {
    return NextResponse.json(
      { error: 'Save at least one L2 component or L3 ingredient before calculating prep time.' },
      { status: 400 }
    )
  }

  return null
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to calculate prep times.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const itemId = String(body.itemId || '').trim()

    if (!itemId) {
      return NextResponse.json({ error: 'Missing L2 item id.' }, { status: 400 })
    }

    const item = await calculateL2PrepTime(tenant.restaurantId, itemId)
    return NextResponse.json(item)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    const aiError = aiErrorResponse(error)
    if (aiError) return aiError

    const knownError = calculationError(error)
    if (knownError) return knownError

    console.error('POST /api/l2-prep-time failed:', error)
    return NextResponse.json({ error: 'Failed to calculate L2 prep time.' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to confirm prep times.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const itemId = String(body.itemId || '').trim()
    const setupMinutes = minutes(body.setupMinutes)
    const activePrepMinutes = minutes(body.activePrepMinutes)
    const cleanupMinutes = minutes(body.cleanupMinutes)
    const passiveMinutes = minutes(body.passiveMinutes)

    if (!itemId) {
      return NextResponse.json({ error: 'Missing L2 item id.' }, { status: 400 })
    }

    if (
      setupMinutes === null ||
      activePrepMinutes === null ||
      cleanupMinutes === null ||
      passiveMinutes === null
    ) {
      return NextResponse.json(
        { error: 'All prep-time fields must be zero or greater.' },
        { status: 400 }
      )
    }

    const { item, fingerprint } = await getL2PrepTimeContext(tenant.restaurantId, itemId)

    if (!item.prepTimeFingerprint || item.prepTimeFingerprint !== fingerprint) {
      return NextResponse.json(
        { error: 'The recipe or SOP changed. Recalculate prep time before confirming it.' },
        { status: 400 }
      )
    }

    const handsOnMinutes = Math.round(
      (setupMinutes + activePrepMinutes + cleanupMinutes) * 10
    ) / 10
    const elapsedMinutes = Math.round((handsOnMinutes + passiveMinutes) * 10) / 10
    const assumptions = Array.isArray(body.assumptions)
      ? body.assumptions.map((value: unknown) => String(value).trim()).filter(Boolean).slice(0, 12)
      : []

    const updated = await prisma.item.update({
      where: { id: itemId },
      data: {
        prepSetupMinutes: setupMinutes,
        prepActiveMinutes: activePrepMinutes,
        prepCleanupMinutes: cleanupMinutes,
        prepPassiveMinutes: passiveMinutes,
        prepHandsOnMinutes: handsOnMinutes,
        prepElapsedMinutes: elapsedMinutes,
        prepTimeAssumptions: assumptions,
        prepTimeStatus: 'CONFIRMED',
        prepTimeConfirmedAt: new Date(),
        prepTimeConfirmedBy: tenant.email,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    const knownError = calculationError(error)
    if (knownError) return knownError

    console.error('PATCH /api/l2-prep-time failed:', error)
    return NextResponse.json({ error: 'Failed to confirm L2 prep time.' }, { status: 500 })
  }
}
