import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  createStaffSessionToken,
  STAFF_SESSION_COOKIE,
  STAFF_SESSION_SECONDS,
  verifyPin,
} from '@/lib/staff-auth'

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const restaurantCode = String(body.restaurantCode || '').trim()
    const username = String(body.username || '').trim().toLowerCase()
    const pin = String(body.pin || '').trim()

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
