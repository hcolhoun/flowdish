import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'

type TenantContext = {
  authUserId: string
  email: string | null
  restaurantId: string
  restaurantName: string
  role: 'OWNER' | 'ADMIN' | 'CHEF' | 'VIEWER'
}

function env(name: string) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`)
  }

  return value
}

export async function getCurrentUser() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    env('NEXT_PUBLIC_SUPABASE_URL'),
    env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Safe to ignore where cookies cannot be set.
          }
        },
      },
    }
  )

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  return {
    id: user.id,
    email: user.email ?? null,
  }
}

export async function requireTenant(): Promise<TenantContext> {
  const user = await getCurrentUser()

  if (!user) {
    throw new Error('UNAUTHENTICATED')
  }

  let membership = await prisma.userMembership.findFirst({
    where: {
      authUserId: user.id,
    },
    include: {
      restaurant: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  })

  if (!membership) {
    const restaurant = await prisma.restaurant.create({
      data: {
        name: user.email ? `${user.email}'s Restaurant` : 'New Restaurant',
        memberships: {
          create: {
            authUserId: user.id,
            email: user.email,
            role: 'OWNER',
          },
        },
      },
      include: {
        memberships: true,
      },
    })

    membership = await prisma.userMembership.findFirst({
      where: {
        authUserId: user.id,
        restaurantId: restaurant.id,
      },
      include: {
        restaurant: true,
      },
    })
  }

  if (!membership) {
    throw new Error('TENANT_NOT_FOUND')
  }

  return {
    authUserId: user.id,
    email: user.email,
    restaurantId: membership.restaurantId,
    restaurantName: membership.restaurant.name,
    role: membership.role,
  }
}

export function tenantErrorResponse(error: unknown) {
  if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
    return Response.json({ error: 'You must be logged in.' }, { status: 401 })
  }

  if (error instanceof Error && error.message === 'TENANT_NOT_FOUND') {
    return Response.json({ error: 'No restaurant account found.' }, { status: 403 })
  }

  return null
}

export function canWrite(role: TenantContext['role']) {
  return role === 'OWNER' || role === 'ADMIN' || role === 'CHEF'
}

export function canAdmin(role: TenantContext['role']) {
  return role === 'OWNER' || role === 'ADMIN'
}