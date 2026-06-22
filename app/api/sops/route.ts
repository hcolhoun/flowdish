import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'
import { markL2PrepTimeStale } from '@/lib/l2-prep-time'

async function buildSop({
  restaurantId,
  itemId,
}: {
  restaurantId: string
  itemId: string
}) {
  const item = await prisma.item.findFirst({
    where: {
      id: itemId,
      restaurantId,
    },
  })

  if (!item) {
    return null
  }

  const sop = await prisma.sopDocument.findFirst({
    where: {
      restaurantId,
      itemId,
    },
  })

  if (item.itemType === 'L2') {
    const directComponents = await prisma.bomL2L2.findMany({
      where: {
        restaurantId,
        parentL2ItemId: itemId,
      },
      include: {
        childL2: true,
      },
      orderBy: { id: 'asc' },
    })

    const directIngredients = await prisma.bomL2L3.findMany({
      where: {
        restaurantId,
        l2ItemId: itemId,
      },
      include: { l3: true },
      orderBy: { id: 'asc' },
    })

    return {
      item,
      instructions: sop?.instructions ?? '',
      updatedAt: sop?.updatedAt ?? null,
      directComponents: directComponents.map((row: any) => ({
        itemId: row.childL2.id,
        sku: row.childL2.sku,
        name: row.childL2.name,
        qty: row.qty,
        unitType: row.childL2.unitType,
      })),
      directIngredients: directIngredients.map((row: any) => ({
        itemId: row.l3.id,
        sku: row.l3.sku,
        name: row.l3.name,
        qty: row.qty,
        unitType: row.l3.unitType,
      })),
      expandedIngredients: directIngredients.map((row: any) => ({
        parentSku: item.sku,
        parentName: item.name,
        sku: row.l3.sku,
        name: row.l3.name,
        qty: row.qty,
        unitType: row.l3.unitType,
      })),
    }
  }

  if (item.itemType === 'L1') {
    const directComponents = await prisma.bomL1L2.findMany({
      where: {
        restaurantId,
        l1ItemId: itemId,
      },
      include: { l2: true },
      orderBy: { id: 'asc' },
    })

    const directIngredients = await prisma.bomL1L3.findMany({
      where: {
        restaurantId,
        l1ItemId: itemId,
      },
      include: { l3: true },
      orderBy: { id: 'asc' },
    })

    const expandedIngredients: Array<{
      parentSku: string
      parentName: string
      sku: string
      name: string
      qty: number
      unitType: string
    }> = []

    for (const component of directComponents as any[]) {
      const nestedL2Rows = await prisma.bomL2L2.findMany({
        where: {
          restaurantId,
          parentL2ItemId: component.l2.id,
        },
        include: {
          childL2: true,
        },
        orderBy: { id: 'asc' },
      })

      for (const row of nestedL2Rows as any[]) {
        expandedIngredients.push({
          parentSku: component.l2.sku,
          parentName: component.l2.name,
          sku: row.childL2.sku,
          name: row.childL2.name,
          qty: row.qty,
          unitType: row.childL2.unitType,
        })
      }

      const nestedL3Rows = await prisma.bomL2L3.findMany({
        where: {
          restaurantId,
          l2ItemId: component.l2.id,
        },
        include: { l3: true },
        orderBy: { id: 'asc' },
      })

      for (const row of nestedL3Rows as any[]) {
        expandedIngredients.push({
          parentSku: component.l2.sku,
          parentName: component.l2.name,
          sku: row.l3.sku,
          name: row.l3.name,
          qty: row.qty,
          unitType: row.l3.unitType,
        })
      }
    }

    for (const row of directIngredients as any[]) {
      expandedIngredients.push({
        parentSku: item.sku,
        parentName: item.name,
        sku: row.l3.sku,
        name: row.l3.name,
        qty: row.qty,
        unitType: row.l3.unitType,
      })
    }

    return {
      item,
      instructions: sop?.instructions ?? '',
      updatedAt: sop?.updatedAt ?? null,
      directComponents: directComponents.map((row: any) => ({
        itemId: row.l2.id,
        sku: row.l2.sku,
        name: row.l2.name,
        qty: row.qty,
        unitType: row.l2.unitType,
      })),
      directIngredients: directIngredients.map((row: any) => ({
        itemId: row.l3.id,
        sku: row.l3.sku,
        name: row.l3.name,
        qty: row.qty,
        unitType: row.l3.unitType,
      })),
      expandedIngredients,
    }
  }

  return {
    error: 'SOP is only supported for L1 and L2 items',
  }
}

export async function GET(req: Request) {
  try {
    const tenant = await requireTenant()

    const { searchParams } = new URL(req.url)
    const itemId = searchParams.get('itemId')

    if (!itemId) {
      const sops = await prisma.sopDocument.findMany({
        where: {
          restaurantId: tenant.restaurantId,
        },
        include: { item: true },
        orderBy: { updatedAt: 'desc' },
      })

      return NextResponse.json(
        sops.map((sop: any) => ({
          id: sop.id,
          itemId: sop.itemId,
          instructions: sop.instructions,
          updatedAt: sop.updatedAt,
          item: {
            id: sop.item.id,
            sku: sop.item.sku,
            name: sop.item.name,
            itemType: sop.item.itemType,
          },
        }))
      )
    }

    const result = await buildSop({
      restaurantId: tenant.restaurantId,
      itemId,
    })

    if (!result) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/sops failed:', error)
    return NextResponse.json({ error: 'Failed to load SOP' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to save SOPs.' },
        { status: 403 }
      )
    }

    const body = await req.json()

    const itemId = String(body.itemId || '')
    const instructions = String(body.instructions || '')

    if (!itemId) {
      return NextResponse.json({ error: 'Missing itemId' }, { status: 400 })
    }

    const item = await prisma.item.findFirst({
      where: {
        id: itemId,
        restaurantId: tenant.restaurantId,
      },
    })

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    if (item.itemType !== 'L1' && item.itemType !== 'L2') {
      return NextResponse.json(
        { error: 'SOP is only supported for L1 and L2 items' },
        { status: 400 }
      )
    }

    const existing = await prisma.sopDocument.findFirst({
      where: {
        restaurantId: tenant.restaurantId,
        itemId,
      },
    })

    if (existing) {
      await prisma.sopDocument.update({
        where: {
          id: existing.id,
        },
        data: {
          instructions,
        },
      })
    } else {
      await prisma.sopDocument.create({
        data: {
          restaurantId: tenant.restaurantId,
          itemId,
          instructions,
        },
      })
    }

    if (item.itemType === 'L2') {
      await markL2PrepTimeStale(tenant.restaurantId, itemId)
    }

    const fullSop = await buildSop({
      restaurantId: tenant.restaurantId,
      itemId,
    })

    return NextResponse.json(fullSop)
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('POST /api/sops failed:', error)
    return NextResponse.json({ error: 'Failed to save SOP' }, { status: 500 })
  }
}
