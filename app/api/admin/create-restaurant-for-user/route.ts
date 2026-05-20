import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'
import { isSystemOwnerEmail } from '@/lib/system-owner'

const TEMPLATE_RESTAURANT_ID = 'base_template_restaurant'

function cleanRestaurantName(value: unknown, email: string) {
  const name = String(value || '').trim()

  if (name) return name

  return `${email}'s Restaurant`
}

async function findAuthUserByEmail(email: string) {
  const users = await prisma.$queryRaw<Array<{ id: string; email: string }>>`
    SELECT id::text, email
    FROM auth.users
    WHERE lower(email) = lower(${email})
    LIMIT 1
  `

  return users[0] ?? null
}

async function copyTemplateRestaurant({
  templateRestaurantId,
  targetRestaurantId,
}: {
  templateRestaurantId: string
  targetRestaurantId: string
}) {
  const templateItems = await prisma.item.findMany({
    where: { restaurantId: templateRestaurantId },
    orderBy: { createdAt: 'asc' },
  })

  const itemIdMap = new Map<string, string>()

  for (const item of templateItems) {
    const copied = await prisma.item.create({
      data: {
        restaurantId: targetRestaurantId,
        sku: item.sku,
        name: item.name,
        itemType: item.itemType,
        unitType: item.unitType,
        shelfLifeDays: item.shelfLifeDays,
        sellingPrice: item.sellingPrice,
        standardBatchOutput: item.standardBatchOutput,
        buildStatus: item.buildStatus,
      },
    })

    itemIdMap.set(item.id, copied.id)
  }

  const templateSupplierProducts = await prisma.supplierProduct.findMany({
    where: { restaurantId: templateRestaurantId },
    orderBy: { createdAt: 'asc' },
  })

  let supplierProductCount = 0

  for (const product of templateSupplierProducts) {
    await prisma.supplierProduct.create({
      data: {
        restaurantId: targetRestaurantId,
        supplier: product.supplier,
        supplierSku: product.supplierSku,
        name: product.name,
        packSize: product.packSize,
        weight: product.weight,
        packPrice: product.packPrice,
        unitPrice: product.unitPrice,
        linkedItemId: product.linkedItemId
          ? itemIdMap.get(product.linkedItemId) ?? null
          : null,
      },
    })

    supplierProductCount++
  }

  const bomL0L1Rows = await prisma.bomL0L1.findMany({
    where: { restaurantId: templateRestaurantId },
  })

  for (const row of bomL0L1Rows) {
    const l0ItemId = itemIdMap.get(row.l0ItemId)
    const l1ItemId = itemIdMap.get(row.l1ItemId)

    if (!l0ItemId || !l1ItemId) continue

    await prisma.bomL0L1.create({
      data: {
        restaurantId: targetRestaurantId,
        l0ItemId,
        l1ItemId,
        qty: row.qty,
      },
    })
  }

  const bomL1L2Rows = await prisma.bomL1L2.findMany({
    where: { restaurantId: templateRestaurantId },
  })

  for (const row of bomL1L2Rows) {
    const l1ItemId = itemIdMap.get(row.l1ItemId)
    const l2ItemId = itemIdMap.get(row.l2ItemId)

    if (!l1ItemId || !l2ItemId) continue

    await prisma.bomL1L2.create({
      data: {
        restaurantId: targetRestaurantId,
        l1ItemId,
        l2ItemId,
        qty: row.qty,
      },
    })
  }

  const bomL1L3Rows = await prisma.bomL1L3.findMany({
    where: { restaurantId: templateRestaurantId },
  })

  for (const row of bomL1L3Rows) {
    const l1ItemId = itemIdMap.get(row.l1ItemId)
    const l3ItemId = itemIdMap.get(row.l3ItemId)

    if (!l1ItemId || !l3ItemId) continue

    await prisma.bomL1L3.create({
      data: {
        restaurantId: targetRestaurantId,
        l1ItemId,
        l3ItemId,
        qty: row.qty,
      },
    })
  }

  const bomL2L2Rows = await prisma.bomL2L2.findMany({
    where: { restaurantId: templateRestaurantId },
  })

  for (const row of bomL2L2Rows) {
    const parentL2ItemId = itemIdMap.get(row.parentL2ItemId)
    const childL2ItemId = itemIdMap.get(row.childL2ItemId)

    if (!parentL2ItemId || !childL2ItemId) continue

    await prisma.bomL2L2.create({
      data: {
        restaurantId: targetRestaurantId,
        parentL2ItemId,
        childL2ItemId,
        qty: row.qty,
      },
    })
  }

  const bomL2L3Rows = await prisma.bomL2L3.findMany({
    where: { restaurantId: templateRestaurantId },
  })

  for (const row of bomL2L3Rows) {
    const l2ItemId = itemIdMap.get(row.l2ItemId)
    const l3ItemId = itemIdMap.get(row.l3ItemId)

    if (!l2ItemId || !l3ItemId) continue

    await prisma.bomL2L3.create({
      data: {
        restaurantId: targetRestaurantId,
        l2ItemId,
        l3ItemId,
        qty: row.qty,
      },
    })
  }

  const sopDocuments = await prisma.sopDocument.findMany({
    where: { restaurantId: templateRestaurantId },
  })

  let sopCount = 0

  for (const sop of sopDocuments) {
    const itemId = itemIdMap.get(sop.itemId)

    if (!itemId) continue

    await prisma.sopDocument.create({
      data: {
        restaurantId: targetRestaurantId,
        itemId,
        instructions: sop.instructions,
      },
    })

    sopCount++
  }

  return {
    itemCount: itemIdMap.size,
    supplierProductCount,
    sopCount,
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!isSystemOwnerEmail(tenant.email)) {
      return NextResponse.json(
        { error: 'System owner access required.' },
        { status: 403 }
      )
    }

    const body = await req.json()

    const email = String(body.email || '').trim().toLowerCase()
    const restaurantName = cleanRestaurantName(body.restaurantName, email)
    const mode = String(body.mode || 'EMPTY').toUpperCase()

    if (!email) {
      return NextResponse.json({ error: 'User email is required.' }, { status: 400 })
    }

    if (mode !== 'EMPTY' && mode !== 'FRONTLOAD') {
      return NextResponse.json(
        { error: 'Mode must be EMPTY or FRONTLOAD.' },
        { status: 400 }
      )
    }

    const authUser = await findAuthUserByEmail(email)

    if (!authUser) {
      return NextResponse.json(
        {
          error:
            'No Supabase Auth user exists for this email yet. Ask the user to sign up first, then run this again.',
        },
        { status: 404 }
      )
    }

    const existingMembership = await prisma.userMembership.findFirst({
      where: {
        authUserId: authUser.id,
      },
      include: {
        restaurant: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    if (existingMembership) {
      return NextResponse.json(
        {
          error: `This user is already linked to a restaurant: ${existingMembership.restaurant.name}`,
          existingMembership,
        },
        { status: 400 }
      )
    }

    const restaurant = await prisma.restaurant.create({
      data: {
        name: restaurantName,
        isTemplate: false,
        memberships: {
          create: {
            authUserId: authUser.id,
            email: authUser.email,
            role: 'OWNER',
          },
        },
      },
    })

    let frontloadResult: null | {
      itemCount: number
      supplierProductCount: number
      sopCount: number
    } = null

    if (mode === 'FRONTLOAD') {
      const template = await prisma.restaurant.findFirst({
        where: {
          id: TEMPLATE_RESTAURANT_ID,
          isTemplate: true,
        },
      })

      if (!template) {
        return NextResponse.json(
          {
            error: 'Template restaurant was not found or is not marked as template.',
          },
          { status: 400 }
        )
      }

      frontloadResult = await copyTemplateRestaurant({
        templateRestaurantId: template.id,
        targetRestaurantId: restaurant.id,
      })
    }

    const membership = await prisma.userMembership.findFirst({
      where: {
        authUserId: authUser.id,
        restaurantId: restaurant.id,
      },
      include: {
        restaurant: true,
      },
    })

    return NextResponse.json({
      success: true,
      mode,
      restaurant,
      membership,
      frontloadResult,
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('POST /api/admin/create-restaurant-for-user failed:', error)
    return NextResponse.json(
      { error: 'Failed to create restaurant for user.' },
      { status: 500 }
    )
  }
}