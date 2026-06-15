import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAdmin, requireTenant, tenantErrorResponse } from '@/lib/tenant'
import { isSystemOwnerEmail } from '@/lib/system-owner'
import { hashPin } from '@/lib/staff-auth'

type RouteContext = {
  params: Promise<{
    staffUserId: string
  }>
}

async function requireStaffAdmin() {
  const tenant = await requireTenant()
  const isSystemOwner = isSystemOwnerEmail(tenant.email)
  const isHeadChef = canAdmin(tenant.role)

  if (!isSystemOwner && !isHeadChef) {
    throw new Error('FORBIDDEN')
  }

  return tenant
}

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const tenant = await requireStaffAdmin()
    const { staffUserId } = await context.params
    const body = await req.json()
    const displayName = String(body.displayName || '').trim()
    const pin = String(body.pin || '').trim()

    if (!displayName) {
      return NextResponse.json({ error: 'Display name is required.' }, { status: 400 })
    }

    if (pin && !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be exactly 4 digits.' }, { status: 400 })
    }

    const staffUser = await prisma.staffUser.findFirst({
      where: {
        id: staffUserId,
        restaurantId: tenant.restaurantId,
        isAccountPin: false,
      },
    })

    if (!staffUser) {
      return NextResponse.json({ error: 'Staff PIN user not found.' }, { status: 404 })
    }

    const updated = await prisma.staffUser.update({
      where: {
        id: staffUser.id,
      },
      data: {
        displayName,
        ...(pin ? { pinHash: hashPin(pin), active: true } : {}),
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        active: true,
        isAccountPin: true,
        accountEmail: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ success: true, staffUser: updated })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Head Chef access required.' }, { status: 403 })
    }

    console.error('PATCH /api/admin/staff-users/[staffUserId] failed:', error)
    return NextResponse.json({ error: 'Failed to update staff PIN user.' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  try {
    const tenant = await requireStaffAdmin()
    const { staffUserId } = await context.params

    const staffUser = await prisma.staffUser.findFirst({
      where: {
        id: staffUserId,
        restaurantId: tenant.restaurantId,
        isAccountPin: false,
      },
    })

    if (!staffUser) {
      return NextResponse.json({ error: 'Staff PIN user not found.' }, { status: 404 })
    }

    await prisma.staffUser.update({
      where: {
        id: staffUser.id,
      },
      data: {
        active: false,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Head Chef access required.' }, { status: 403 })
    }

    console.error('DELETE /api/admin/staff-users/[staffUserId] failed:', error)
    return NextResponse.json({ error: 'Failed to remove staff PIN user.' }, { status: 500 })
  }
}
