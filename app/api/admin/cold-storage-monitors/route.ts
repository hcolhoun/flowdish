import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'
import { isSystemOwnerEmail } from '@/lib/system-owner'

function makeDeviceKey() {
  return `fd_cs_${randomBytes(24).toString('hex')}`
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null

  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export async function GET() {
  try {
    const tenant = await requireTenant()

    if (!isSystemOwnerEmail(tenant.email)) {
      return NextResponse.json({ error: 'System owner access required.' }, { status: 403 })
    }

    const [restaurants, monitors] = await Promise.all([
      prisma.restaurant.findMany({
        where: {
          isTemplate: false,
        },
        orderBy: {
          name: 'asc',
        },
        select: {
          id: true,
          name: true,
          plan: true,
        },
      }),
      prisma.coldStorageMonitor.findMany({
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          restaurant: {
            select: {
              id: true,
              name: true,
            },
          },
          readings: {
            orderBy: {
              recordedAt: 'desc',
            },
            take: 1,
          },
        },
      }),
    ])

    return NextResponse.json({ restaurants, monitors })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/admin/cold-storage-monitors failed:', error)
    return NextResponse.json({ error: 'Failed to load cold storage monitors.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!isSystemOwnerEmail(tenant.email)) {
      return NextResponse.json({ error: 'System owner access required.' }, { status: 403 })
    }

    const body = await req.json()
    const restaurantId = String(body.restaurantId || '').trim()
    const name = String(body.name || '').trim()
    const location = String(body.location || '').trim() || null
    const storageType = String(body.storageType || 'FRIDGE').trim()
    const minTempC = toNullableNumber(body.minTempC)
    const maxTempC = toNullableNumber(body.maxTempC)

    if (!restaurantId || !name) {
      return NextResponse.json({ error: 'Restaurant and monitor name are required.' }, { status: 400 })
    }

    const restaurant = await prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        isTemplate: false,
      },
    })

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 })
    }

    const monitor = await prisma.coldStorageMonitor.create({
      data: {
        restaurantId,
        name,
        location,
        storageType,
        minTempC,
        maxTempC,
        deviceKey: makeDeviceKey(),
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json({ success: true, monitor })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('POST /api/admin/cold-storage-monitors failed:', error)
    return NextResponse.json({ error: 'Failed to create cold storage monitor.' }, { status: 500 })
  }
}
