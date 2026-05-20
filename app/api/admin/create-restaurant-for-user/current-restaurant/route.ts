import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAdmin, requireTenant, tenantErrorResponse } from '@/lib/tenant'

export async function GET() {
  try {
    const tenant = await requireTenant()

    if (!canAdmin(tenant.role)) {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    const restaurant = await prisma.restaurant.findFirst({
      where: {
        id: tenant.restaurantId,
      },
      include: {
        memberships: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    })

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 })
    }

    const templateRestaurants = await prisma.restaurant.findMany({
      where: {
        isTemplate: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        name: true,
        slug: true,
        isTemplate: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      currentUser: {
        authUserId: tenant.authUserId,
        email: tenant.email,
        role: tenant.role,
      },
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        isTemplate: restaurant.isTemplate,
        createdAt: restaurant.createdAt,
        updatedAt: restaurant.updatedAt,
      },
      memberships: restaurant.memberships.map((membership) => ({
        id: membership.id,
        authUserId: membership.authUserId,
        email: membership.email,
        role: membership.role,
        createdAt: membership.createdAt,
      })),
      templateRestaurants,
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/admin/current-restaurant failed:', error)
    return NextResponse.json(
      { error: 'Failed to load admin restaurant data.' },
      { status: 500 }
    )
  }
}