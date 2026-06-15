import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  createStaffSessionToken,
  STAFF_SESSION_COOKIE,
  STAFF_SESSION_SECONDS,
  verifyPin,
} from '@/lib/staff-auth'
import { turnstileErrorMessage, verifyTurnstileToken } from '@/lib/turnstile'

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const restaurantCode = String(body.restaurantCode || '').trim()
    const username = String(body.username || '').trim().toLowerCase()
    const pin = String(body.pin || '').trim()
    const remoteIp = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')

    try {
      await verifyTurnstileToken(body.turnstileToken, remoteIp)
    } catch (error) {
      return NextResponse.json({ error: turnstileErrorMessage(error) }, { status: 400 })
    }

    if (!restaurantCode) {
      return NextResponse.json({ error: 'Restaurant code is required.' }, { status: 400 })
    }

    if (!username) {
      return NextResponse.json({ error: 'Username is required.' }, { status: 400 })
    }

    if (!/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be exactly 4 digits.' }, { status: 400 })
    }

    const restaurant = await prisma.restaurant.findFirst({
      where: {
        OR: [
          { id: restaurantCode },
          { slug: restaurantCode },
        ],
      },
    })

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 })
    }

    const staffUser = await prisma.staffUser.findFirst({
      where: {
        restaurantId: restaurant.id,
        username,
        active: true,
      },
    })

    if (!staffUser) {
      return NextResponse.json({ error: 'Invalid staff login.' }, { status: 401 })
    }

    const validPin = verifyPin(pin, staffUser.pinHash)

    if (!validPin) {
      return NextResponse.json({ error: 'Invalid staff login.' }, { status: 401 })
    }

    const accountMembership =
      staffUser.isAccountPin && staffUser.accountAuthUserId
        ? await prisma.userMembership.findFirst({
            where: {
              authUserId: staffUser.accountAuthUserId,
              restaurantId: restaurant.id,
            },
            select: {
              role: true,
            },
          })
        : null

    const accountHasFullAccess =
      accountMembership?.role === 'OWNER' || accountMembership?.role === 'ADMIN'

    const token = createStaffSessionToken({
      type: 'staff',
      staffUserId: staffUser.id,
      restaurantId: restaurant.id,
      username: staffUser.username,
      displayName: staffUser.displayName,
      isAccountPin: staffUser.isAccountPin,
      accountAuthUserId: staffUser.accountAuthUserId,
      accountEmail: staffUser.accountEmail,
    })

    const res = NextResponse.json({
      success: true,
      staffUser: {
        id: staffUser.id,
        username: staffUser.username,
        displayName: staffUser.displayName,
        isAccountPin: staffUser.isAccountPin,
      },
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
      },
      redirectTo: accountHasFullAccess ? '/' : '/prep',
      expiresInSeconds: STAFF_SESSION_SECONDS,
    })

    res.cookies.set(STAFF_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: STAFF_SESSION_SECONDS,
    })

    return res
  } catch (error) {
    console.error('POST /api/staff-login failed:', error)
    return NextResponse.json({ error: 'Failed to log staff in.' }, { status: 500 })
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true })

  res.cookies.set(STAFF_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })

  return res
}
