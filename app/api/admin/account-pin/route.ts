import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'
import { hashPin } from '@/lib/staff-auth'

function slugifyName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function makeAccountPinUsername(email: string | null) {
  const clean = slugifyName(email ? email.split('@')[0] : 'head-chef')
  return `chef-${clean || 'head-chef'}`
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (tenant.role !== 'OWNER' && tenant.role !== 'ADMIN' && tenant.role !== 'CHEF') {
      return NextResponse.json(
        { error: 'Only kitchen account users can create their own PIN.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const pin = String(body.pin || '').trim()
    const displayName = String(body.displayName || '').trim() || tenant.email || 'Head Chef'

    if (!/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be exactly 4 digits.' }, { status: 400 })
    }

    const restaurant = await prisma.restaurant.findFirst({
      where: { id: tenant.restaurantId },
      select: {
        id: true,
        slug: true,
      },
    })

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 })
    }

    const existingAccountPin = await prisma.staffUser.findFirst({
      where: {
        restaurantId: tenant.restaurantId,
        accountAuthUserId: tenant.authUserId,
        isAccountPin: true,
      },
    })

    let username = existingAccountPin?.username || makeAccountPinUsername(tenant.email)

    if (!existingAccountPin) {
      const usernameTaken = await prisma.staffUser.findFirst({
        where: {
          restaurantId: tenant.restaurantId,
          username,
        },
      })

      if (usernameTaken) {
        username = `${username}-${tenant.authUserId.slice(0, 6).toLowerCase()}`
      }
    }

    const staffUser = existingAccountPin
      ? await prisma.staffUser.update({
          where: { id: existingAccountPin.id },
          data: {
            displayName,
            pinHash: hashPin(pin),
            active: true,
            accountEmail: tenant.email,
          },
          select: {
            id: true,
            username: true,
            displayName: true,
            active: true,
            isAccountPin: true,
            createdAt: true,
          },
        })
      : await prisma.staffUser.create({
          data: {
            restaurantId: tenant.restaurantId,
            username,
            displayName,
            pinHash: hashPin(pin),
            active: true,
            isAccountPin: true,
            accountAuthUserId: tenant.authUserId,
            accountEmail: tenant.email,
          },
          select: {
            id: true,
            username: true,
            displayName: true,
            active: true,
            isAccountPin: true,
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

    console.error('POST /api/admin/account-pin failed:', error)
    return NextResponse.json({ error: 'Failed to save account PIN.' }, { status: 500 })
  }
}
