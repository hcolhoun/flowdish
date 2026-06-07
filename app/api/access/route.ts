import { NextResponse } from 'next/server'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'
import { isSystemOwnerEmail } from '@/lib/system-owner'
import { getStaffSession } from '@/lib/staff-auth'

export async function GET() {
  try {
    const staffSession = await getStaffSession()

    if (staffSession?.isAccountPin && staffSession.accountRole) {
      const isHeadChef = staffSession.accountRole === 'OWNER' || staffSession.accountRole === 'ADMIN'
      const isChefStaff = staffSession.accountRole === 'CHEF'

      return NextResponse.json({
        user: {
          email: staffSession.accountEmail,
          authUserId: staffSession.accountAuthUserId,
          staffUserId: staffSession.staffUserId,
          username: staffSession.username,
          displayName: staffSession.displayName,
        },
        restaurant: {
          id: staffSession.restaurantId,
          name: staffSession.restaurantName,
        },
        role: staffSession.accountRole,
        labels: {
          roleLabel: isHeadChef ? 'Head Chef' : 'Chef Staff',
        },
        permissions: {
          isSystemOwner: false,
          isHeadChef,
          isChefStaff,
          isViewer: false,
          canSeeAdmin: isHeadChef,
          canSeeFullKitchenSystem: isHeadChef,
          canSeePrepWasteOnly: isChefStaff,
        },
      })
    }

    if (staffSession) {
      return NextResponse.json({
        user: {
          email: null,
          authUserId: null,
          staffUserId: staffSession.staffUserId,
          username: staffSession.username,
          displayName: staffSession.displayName,
        },
        restaurant: {
          id: staffSession.restaurantId,
          name: staffSession.restaurantName,
        },
        role: 'STAFF',
        labels: {
          roleLabel: 'Chef Staff',
        },
        permissions: {
          isSystemOwner: false,
          isHeadChef: false,
          isChefStaff: true,
          isViewer: false,
          canSeeAdmin: false,
          canSeeFullKitchenSystem: false,
          canSeePrepWasteOnly: true,
        },
      })
    }

    const tenant = await requireTenant()

    const isSystemOwner = isSystemOwnerEmail(tenant.email)
    const isHeadChef = tenant.role === 'OWNER' || tenant.role === 'ADMIN'
    const isChefStaff = tenant.role === 'CHEF'
    const isViewer = tenant.role === 'VIEWER'

    return NextResponse.json({
      user: {
        email: tenant.email,
        authUserId: tenant.authUserId,
      },
      restaurant: {
        id: tenant.restaurantId,
        name: tenant.restaurantName,
      },
      role: tenant.role,
      labels: {
        roleLabel: isSystemOwner
          ? 'System Owner'
          : isHeadChef
            ? 'Head Chef'
            : isChefStaff
              ? 'Chef Staff'
              : 'Viewer',
      },
      permissions: {
        isSystemOwner,
        isHeadChef,
        isChefStaff,
        isViewer,
        canSeeAdmin: isSystemOwner || isHeadChef,
        canSeeFullKitchenSystem: isSystemOwner || isHeadChef,
        canSeePrepWasteOnly: isChefStaff || isViewer,
      },
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/access failed:', error)
    return NextResponse.json({ error: 'Failed to load access profile.' }, { status: 500 })
  }
}
