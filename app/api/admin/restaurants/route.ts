import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'
import { isSystemOwnerEmail } from '@/lib/system-owner'

export async function GET() {
  try {
    const tenant = await requireTenant()

    if (!isSystemOwnerEmail(tenant.email)) {
      return NextResponse.json(
        { error: 'Only System Owners can view all restaurants.' },
        { status: 403 }
      )
    }

    const restaurants = await prisma.restaurant.findMany({
      where: {
        isTemplate: false,
        id: {
            not: 'flowdish_admin_live',
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        memberships: {
          orderBy: {
            createdAt: 'asc',
          },
        },
        _count: {
          select: {
            items: true,
            supplierProducts: true,
            bomL0L1Rows: true,
          },
        },
      },
    })

    return NextResponse.json({
      restaurants: restaurants.map((restaurant) => ({
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        plan: restaurant.plan,
        createdAt: restaurant.createdAt,
        counts: {
          items: restaurant._count.items,
          supplierProducts: restaurant._count.supplierProducts,
          l0Links: restaurant._count.bomL0L1Rows,
        },
        owners: restaurant.memberships
          .filter((membership) => membership.role === 'OWNER')
          .map((membership) => ({
            email: membership.email,
            authUserId: membership.authUserId,
          })),
      })),
    })
  } catch (error) {
    const tenantResponse = tenantErrorResponse(error)

    if (tenantResponse) {
      return tenantResponse
    }

    console.error('GET /api/admin/restaurants failed:', error)

    return NextResponse.json(
      { error: 'Failed to load restaurants.' },
      { status: 500 }
    )
  }
}