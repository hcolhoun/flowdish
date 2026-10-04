import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getStaffSession } from '@/lib/staff-auth'
import { LEGAL_VERSIONS, planUsesAi } from '@/lib/legal'

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

function makeSlugFromEmail(email: string | null) {
  const base = email ? email.split('@')[0] : 'restaurant'

  const clean = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  return `${clean || 'restaurant'}-${Math.random().toString(36).slice(2, 8)}`
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
    metadata: user.user_metadata as Record<string, unknown>,
  }
}

function metadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function metadataBoolean(metadata: Record<string, unknown>, key: string) {
  return metadata[key] === true
}

function acceptedAtFromMetadata(metadata: Record<string, unknown>) {
  const value = metadataText(metadata, 'legal_accepted_at')
  if (!value) return new Date()

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

async function recordLegalAcceptanceForUser(
  user: { id: string; email: string | null; metadata: Record<string, unknown> },
  restaurantId: string,
  fallbackBusinessName: string
) {
  const selectedPlan = metadataText(user.metadata, 'requested_plan')
  const termsVersion = metadataText(user.metadata, 'terms_version')
  const dpaVersion = metadataText(user.metadata, 'dpa_version')
  const privacyVersion = metadataText(user.metadata, 'privacy_version')
  const authorityConfirmed = metadataBoolean(user.metadata, 'authority_confirmed')

  if (
    !selectedPlan ||
    !termsVersion ||
    !dpaVersion ||
    !privacyVersion ||
    !authorityConfirmed
  ) {
    return
  }

  const businessLegalName =
    metadataText(user.metadata, 'business_legal_name') || fallbackBusinessName
  const aiProcessingAccepted = metadataBoolean(user.metadata, 'ai_processing_accepted')
  const aiNoticeVersion = metadataText(user.metadata, 'ai_notice_version')

  await prisma.legalAcceptance.upsert({
    where: {
      restaurantId_authUserId_termsVersion_dpaVersion_selectedPlan: {
        restaurantId,
        authUserId: user.id,
        termsVersion,
        dpaVersion,
        selectedPlan,
      },
    },
    create: {
      restaurantId,
      authUserId: user.id,
      email: user.email,
      businessLegalName,
      selectedPlan,
      termsVersion,
      dpaVersion,
      privacyVersion,
      aiNoticeVersion:
        planUsesAi(selectedPlan) && aiProcessingAccepted
          ? aiNoticeVersion || LEGAL_VERSIONS.aiNotice
          : null,
      authorityConfirmed,
      aiProcessingAccepted: planUsesAi(selectedPlan) && aiProcessingAccepted,
      acceptedAt: acceptedAtFromMetadata(user.metadata),
    },
    update: {},
  })
}

async function createEmptyRestaurantForUser(user: {
  id: string
  email: string | null
  metadata: Record<string, unknown>
}) {
  const restaurantName = user.email ? `${user.email}'s Restaurant` : 'New Restaurant'
  const selectedPlan = metadataText(user.metadata, 'requested_plan') || 'HACCP_CORE'
  const businessLegalName =
    metadataText(user.metadata, 'business_legal_name') || restaurantName
  const termsVersion = metadataText(user.metadata, 'terms_version')
  const dpaVersion = metadataText(user.metadata, 'dpa_version')
  const privacyVersion = metadataText(user.metadata, 'privacy_version')
  const authorityConfirmed = metadataBoolean(user.metadata, 'authority_confirmed')
  const aiProcessingAccepted = metadataBoolean(user.metadata, 'ai_processing_accepted')
  const aiNoticeVersion = metadataText(user.metadata, 'ai_notice_version')

  return prisma.restaurant.create({
    data: {
      name: restaurantName,
      slug: makeSlugFromEmail(user.email),
      isTemplate: false,
      plan: 'BASIC',
      memberships: {
        create: {
          authUserId: user.id,
          email: user.email,
          role: 'OWNER',
        },
      },
      legalAcceptances:
        termsVersion && dpaVersion && privacyVersion && authorityConfirmed
          ? {
              create: {
                authUserId: user.id,
                email: user.email,
                businessLegalName,
                selectedPlan,
                termsVersion,
                dpaVersion,
                privacyVersion,
                aiNoticeVersion:
                  planUsesAi(selectedPlan) && aiProcessingAccepted
                    ? aiNoticeVersion || LEGAL_VERSIONS.aiNotice
                    : null,
                authorityConfirmed,
                aiProcessingAccepted: planUsesAi(selectedPlan) && aiProcessingAccepted,
                acceptedAt: acceptedAtFromMetadata(user.metadata),
              },
            }
          : undefined,
    },
    include: {
      memberships: true,
    },
  })
}

export async function requireTenant(): Promise<TenantContext> {
  const user = await getCurrentUser()

  if (!user) {
    const staffSession = await getStaffSession()

    if (staffSession?.isAccountPin && staffSession.accountAuthUserId && staffSession.accountRole) {
      if (
        staffSession.accountRole !== 'OWNER' &&
        staffSession.accountRole !== 'ADMIN' &&
        staffSession.accountRole !== 'CHEF'
      ) {
        throw new Error('UNAUTHENTICATED')
      }

      return {
        authUserId: staffSession.accountAuthUserId,
        email: staffSession.accountEmail,
        restaurantId: staffSession.restaurantId,
        restaurantName: staffSession.restaurantName,
        role: staffSession.accountRole,
      }
    }

    throw new Error('UNAUTHENTICATED')
  }

  let membership = await prisma.userMembership.findFirst({
    where: {
      authUserId: user.id,
    },
    include: {
      restaurant: {
        select: {
          id: true,
          name: true,
          isTemplate: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  })

  if (!membership) {
    const restaurant = await createEmptyRestaurantForUser(user)

    membership = await prisma.userMembership.findFirst({
      where: {
        authUserId: user.id,
        restaurantId: restaurant.id,
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            isTemplate: true,
          },
        },
      },
    })
  }

  if (!membership) {
    throw new Error('TENANT_NOT_FOUND')
  }

  if (membership.restaurant.isTemplate) {
    throw new Error('TEMPLATE_RESTAURANT_LOGIN_BLOCKED')
  }

  await recordLegalAcceptanceForUser(
    user,
    membership.restaurantId,
    membership.restaurant.name
  )

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

  if (error instanceof Error && error.message === 'TEMPLATE_RESTAURANT_LOGIN_BLOCKED') {
    return Response.json(
      {
        error:
          'This account is linked to a template restaurant. Templates cannot be used as live accounts.',
      },
      { status: 403 }
    )
  }

  return null
}

export function canWrite(role: TenantContext['role']) {
  return role === 'OWNER' || role === 'ADMIN' || role === 'CHEF'
}

export function canAdmin(role: TenantContext['role']) {
  return role === 'OWNER' || role === 'ADMIN'
}
