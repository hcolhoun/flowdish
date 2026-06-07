import { getStaffSession } from '@/lib/staff-auth'
import { requireTenant } from '@/lib/tenant'
import { isSystemOwnerEmail } from '@/lib/system-owner'

export type KitchenAccess =
  | {
      type: 'STAFF'
      restaurantId: string
      restaurantName: string
      role: 'STAFF'
      displayName: string
      staffUserId: string
      canRecordPrepWaste: true
    }
  | {
      type: 'AUTH'
      restaurantId: string
      restaurantName: string
      role: 'OWNER' | 'ADMIN' | 'CHEF' | 'VIEWER'
      email: string | null
      authUserId: string
      isSystemOwner: boolean
      canRecordPrepWaste: boolean
    }

export async function requireKitchenAccess(): Promise<KitchenAccess> {
  const staffSession = await getStaffSession()

  if (staffSession?.isAccountPin && staffSession.accountAuthUserId && staffSession.accountRole) {
    return {
      type: 'AUTH',
      restaurantId: staffSession.restaurantId,
      restaurantName: staffSession.restaurantName,
      role: staffSession.accountRole,
      email: staffSession.accountEmail,
      authUserId: staffSession.accountAuthUserId,
      isSystemOwner: false,
      canRecordPrepWaste:
        staffSession.accountRole === 'OWNER' ||
        staffSession.accountRole === 'ADMIN' ||
        staffSession.accountRole === 'CHEF',
    }
  }

  if (staffSession) {
    return {
      type: 'STAFF',
      restaurantId: staffSession.restaurantId,
      restaurantName: staffSession.restaurantName,
      role: 'STAFF',
      displayName: staffSession.displayName,
      staffUserId: staffSession.staffUserId,
      canRecordPrepWaste: true,
    }
  }

  const tenant = await requireTenant()
  const isSystemOwner = isSystemOwnerEmail(tenant.email)

  return {
    type: 'AUTH',
    restaurantId: tenant.restaurantId,
    restaurantName: tenant.restaurantName,
    role: tenant.role,
    email: tenant.email,
    authUserId: tenant.authUserId,
    isSystemOwner,
    canRecordPrepWaste:
      isSystemOwner || tenant.role === 'OWNER' || tenant.role === 'ADMIN' || tenant.role === 'CHEF',
  }
}

export function kitchenAccessErrorResponse(error: unknown) {
  if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
    return Response.json({ error: 'You must be logged in.' }, { status: 401 })
  }

  if (error instanceof Error && error.message === 'TENANT_NOT_FOUND') {
    return Response.json({ error: 'No restaurant account found.' }, { status: 403 })
  }

  return null
}
