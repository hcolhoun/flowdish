import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'

function slugifyName(name: string) {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function uniqueSku(restaurantId: string, itemType: string, name: string) {
  const base = `${itemType}-${slugifyName(name) || 'COPY'}`.slice(0, 70)
  let candidate = base
  let suffix = 2

  while (
    await prisma.item.findFirst({
      where: {
        restaurantId,
        sku: candidate,
      },
      select: { id: true },
    })
  ) {
    candidate = `${base}-${suffix}`.slice(0, 80)
    suffix += 1
  }

  return candidate
}

async function uniqueName(restaurantId: string, sourceName: string) {
  const base = `${sourceName} Copy`
  let candidate = base
  let suffix = 2

  while (
    await prisma.item.findFirst({
      where: {
        restaurantId,
        name: candidate,
      },
      select: { id: true },
    })
  ) {
    candidate = `${base} ${suffix}`
    suffix += 1
  }

  return candidate
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to copy items.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const sourceItemId = String(body.sourceItemId || '').trim()

    if (!sourceItemId) {
      return NextResponse.json({ error: 'Source item is required.' }, { status: 400 })
    }

    const source = await prisma.item.findFirst({
      where: {
        id: sourceItemId,
        restaurantId: tenant.restaurantId,
      },
      include: {
        sopDocument: true,
      },
    })

    if (!source) {
      return NextResponse.json({ error: 'Item not found.' }, { status: 404 })
    }

    if (source.itemType !== 'L1' && source.itemType !== 'L2') {
      return NextResponse.json(
        { error: 'Only L1 dishes and L2 prep items can be copied.' },
        { status: 400 }
      )
    }

    const [name, sku] = await Promise.all([
      uniqueName(tenant.restaurantId, source.name),
      uniqueSku(tenant.restaurantId, source.itemType, `${source.name} Copy`),
    ])

    const copied = await prisma.$transaction(async (tx) => {
      const item = await tx.item.create({
        data: {
          restaurantId: tenant.restaurantId,
          sku,
          name,
          itemType: source.itemType,
          unitType: source.unitType,
          shelfLifeDays: source.shelfLifeDays,
          sellingPrice: source.itemType === 'L1' ? source.sellingPrice : null,
          standardBatchOutput:
            source.itemType === 'L2' ? source.standardBatchOutput : null,
          buildStatus: 'UNBUILT',
          prepSetupMinutes: null,
          prepActiveMinutes: null,
          prepCleanupMinutes: null,
          prepPassiveMinutes: null,
          prepHandsOnMinutes: null,
          prepElapsedMinutes: null,
          prepTimeConfidence: null,
          prepTimeAssumptions: undefined,
          prepTimeStatus: 'MISSING',
          prepTimeFingerprint: null,
          prepTimeCalculatedAt: null,
          prepTimeConfirmedAt: null,
          prepTimeConfirmedBy: null,
        },
      })

      if (source.itemType === 'L1') {
        const [l2Rows, l3Rows] = await Promise.all([
          tx.bomL1L2.findMany({
            where: {
              restaurantId: tenant.restaurantId,
              l1ItemId: source.id,
            },
          }),
          tx.bomL1L3.findMany({
            where: {
              restaurantId: tenant.restaurantId,
              l1ItemId: source.id,
            },
          }),
        ])

        if (l2Rows.length > 0) {
          await tx.bomL1L2.createMany({
            data: l2Rows.map((row) => ({
              restaurantId: tenant.restaurantId,
              l1ItemId: item.id,
              l2ItemId: row.l2ItemId,
              qty: row.qty,
            })),
          })
        }

        if (l3Rows.length > 0) {
          await tx.bomL1L3.createMany({
            data: l3Rows.map((row) => ({
              restaurantId: tenant.restaurantId,
              l1ItemId: item.id,
              l3ItemId: row.l3ItemId,
              qty: row.qty,
            })),
          })
        }
      }

      if (source.itemType === 'L2') {
        const [l2Rows, l3Rows] = await Promise.all([
          tx.bomL2L2.findMany({
            where: {
              restaurantId: tenant.restaurantId,
              parentL2ItemId: source.id,
            },
          }),
          tx.bomL2L3.findMany({
            where: {
              restaurantId: tenant.restaurantId,
              l2ItemId: source.id,
            },
          }),
        ])

        if (l2Rows.length > 0) {
          await tx.bomL2L2.createMany({
            data: l2Rows.map((row) => ({
              restaurantId: tenant.restaurantId,
              parentL2ItemId: item.id,
              childL2ItemId: row.childL2ItemId,
              qty: row.qty,
            })),
          })
        }

        if (l3Rows.length > 0) {
          await tx.bomL2L3.createMany({
            data: l3Rows.map((row) => ({
              restaurantId: tenant.restaurantId,
              l2ItemId: item.id,
              l3ItemId: row.l3ItemId,
              qty: row.qty,
            })),
          })
        }
      }

      if (source.sopDocument) {
        await tx.sopDocument.create({
          data: {
            restaurantId: tenant.restaurantId,
            itemId: item.id,
            instructions: source.sopDocument.instructions,
          },
        })
      }

      return item
    })

    return NextResponse.json({
      item: copied,
      bomBuilderUrl: `/bom?parentId=${copied.id}`,
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('POST /api/items/copy failed:', error)
    return NextResponse.json({ error: 'Failed to copy item.' }, { status: 500 })
  }
}
