import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAdmin, requireTenant, tenantErrorResponse } from '@/lib/tenant'
import { isSystemOwnerEmail } from '@/lib/system-owner'
import { hashPin } from '@/lib/staff-auth'

function slugifyName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function makeUsername(displayName: string) {
  const clean = slugifyName(displayName)
  return `chef-${clean || 'staff'}`
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()
    const isSystemOwner = isSystemOwnerEmail(tenant.email)
    const isHeadChef = canAdmin(tenant.role)

    if (!isSystemOwner && !isHeadChef) {
      return NextResponse.json({ error: 'Head Chef access required.' }, { status: 403 })
    }

    const body = await req.json()

    const displayName = String(body.displayName || '').trim()
    const pin = String(body.pin || '').trim()
    const requestedUsername = String(body.username || '').trim().toLowerCase()

    if (!displayName) {
      return NextResponse.json({ error: 'Staff first name/display name is required.' }, { status: 400 })
    }

    if (!/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be exactly 4 digits.' }, { status: 400 })
    }

    const restaurant = await prisma.restaurant.findFirst({
      where: {
        id: tenant.restaurantId,
      },
      include: {
        staffUsers: true,
      },
    })

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 })
    }

    const activeStaffCount = restaurant.staffUsers.filter(
      (staff) => staff.active && !staff.isAccountPin
    ).length

    if (restaurant.plan === 'BASIC' && activeStaffCount >= 3) {
      return NextResponse.json(
        {
          error:
            'Basic plan allows 3 staff PIN users. Upgrade this restaurant to Premium for unlimited staff users.',
        },
        { status: 400 }
      )
    }

    const username = requestedUsername || makeUsername(displayName)

    if (!/^chef-[a-z0-9-]+$/.test(username)) {
      return NextResponse.json(
        { error: 'Username must start with chef- and contain only letters, numbers, and dashes.' },
        { status: 400 }
      )
    }

    const existing = await prisma.staffUser.findFirst({
      where: {
        restaurantId: tenant.restaurantId,
        username,
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: `A staff user called ${username} already exists.` },
        { status: 400 }
      )
    }

    const staffUser = await prisma.staffUser.create({
      data: {
        restaurantId: tenant.restaurantId,
        username,
        displayName,
        pinHash: hashPin(pin),
        active: true,
      },
      select: {
        id: true,
        restaurantId: true,
        username: true,
        displayName: true,
        active: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      success: true,
      staffUser,
      login: {
        restaurantCode: restaurant.slug || restaurant.id,
        username: staffUser.username,
      },
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('POST /api/admin/create-staff-user failed:', error)
    return NextResponse.json({ error: 'Failed to create staff user.' }, { status: 500 })
  }
}
