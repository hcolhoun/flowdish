import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

function makeSkuPrefix(itemType: string) {
  if (itemType === 'L0') return 'L0'
  if (itemType === 'L1') return 'L1'
  if (itemType === 'L2') return 'L2'
  return 'L3'
}

function slugifyName(name: string) {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function generateSuggestedSku(itemType: string, name: string) {
  return `${makeSkuPrefix(itemType)}-${slugifyName(name)}`
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null

  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export async function GET() {
  try {
    const items = await prisma.item.findMany({
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(items)
  } catch (error) {
    console.error('GET /api/items failed:', error)
    return NextResponse.json({ error: 'Failed to load items' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const name = String(body.name || '').trim()
    const itemType = body.itemType
    const unitType = itemType === 'L0' || itemType === 'L1' ? 'each' : body.unitType

    let sku = String(body.sku || '').trim()

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    if (!['L0', 'L1', 'L2', 'L3'].includes(itemType)) {
      return NextResponse.json({ error: 'Valid item type is required' }, { status: 400 })
    }

    if (!sku && ['L0', 'L1', 'L2'].includes(itemType)) {
      sku = generateSuggestedSku(itemType, name)
    }

    if (!sku) {
      return NextResponse.json({ error: 'SKU is required' }, { status: 400 })
    }

    if (!['g', 'ml', 'each'].includes(unitType)) {
      return NextResponse.json({ error: 'Valid unit type is required' }, { status: 400 })
    }

    const shelfLifeDays = nullableNumber(body.shelfLifeDays)
    const sellingPrice = nullableNumber(body.sellingPrice)
    const standardBatchOutput = nullableNumber(body.standardBatchOutput)

    if (itemType === 'L2' || itemType === 'L3') {
      if (shelfLifeDays === null || shelfLifeDays <= 0 || Number.isNaN(shelfLifeDays)) {
        return NextResponse.json(
          { error: 'Shelf life days is required for L2/L3 items' },
          { status: 400 }
        )
      }
    }

    const item = await prisma.item.create({
      data: {
        sku,
        name,
        itemType,
        unitType,
        shelfLifeDays: itemType === 'L2' || itemType === 'L3' ? shelfLifeDays : null,
        sellingPrice: itemType === 'L1' ? sellingPrice : null,
        standardBatchOutput: itemType === 'L2' ? standardBatchOutput : null,
        buildStatus: itemType === 'L0' || itemType === 'L1' || itemType === 'L2'
          ? 'UNBUILT'
          : 'BUILT',
      },
    })

    return NextResponse.json(item)
  } catch (error: any) {
    console.error('POST /api/items failed:', error)

    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'That SKU already exists' }, { status: 400 })
    }

    return NextResponse.json({ error: 'Failed to save item' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing item id' }, { status: 400 })
    }

    const item = await prisma.item.findUnique({ where: { id } })

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const [
      bomL0AsParent,
      bomL1AsChildOfL0,
      bomL1AsParent,
      bomL2AsChild,
      bomL1AsParentL3,
      bomL3AsChildL1,
      bomL2AsParentL2,
      bomL2AsChildL2,
      bomL2AsParentL3,
      bomL3AsChildL2,
      deliveries,
      inventoryLots,
      prepBatches,
      sales,
      wastes,
      forecastLines,
    ] = await Promise.all([
      prisma.bomL0L1.count({ where: { l0ItemId: id } }),
      prisma.bomL0L1.count({ where: { l1ItemId: id } }),
      prisma.bomL1L2.count({ where: { l1ItemId: id } }),
      prisma.bomL1L2.count({ where: { l2ItemId: id } }),
      prisma.bomL1L3.count({ where: { l1ItemId: id } }),
      prisma.bomL1L3.count({ where: { l3ItemId: id } }),
      prisma.bomL2L2.count({ where: { parentL2ItemId: id } }),
      prisma.bomL2L2.count({ where: { childL2ItemId: id } }),
      prisma.bomL2L3.count({ where: { l2ItemId: id } }),
      prisma.bomL2L3.count({ where: { l3ItemId: id } }),
      prisma.delivery.count({ where: { itemId: id } }),
      prisma.inventoryLot.count({ where: { itemId: id } }),
      prisma.prepBatch.count({ where: { itemId: id } }),
      prisma.sale.count({ where: { itemId: id } }),
      prisma.waste.count({ where: { itemId: id } }),
      prisma.forecastLine.count({ where: { itemId: id } }),
    ])

    const usageCount =
      bomL0AsParent +
      bomL1AsChildOfL0 +
      bomL1AsParent +
      bomL2AsChild +
      bomL1AsParentL3 +
      bomL3AsChildL1 +
      bomL2AsParentL2 +
      bomL2AsChildL2 +
      bomL2AsParentL3 +
      bomL3AsChildL2 +
      deliveries +
      inventoryLots +
      prepBatches +
      sales +
      wastes +
      forecastLines

    if (usageCount > 0) {
      return NextResponse.json(
        {
          error:
            'Cannot delete this item because it is already used in BOMs or stock/activity records.',
        },
        { status: 400 }
      )
    }

    await prisma.item.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/items failed:', error)
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()

    const id = String(body.id || '').trim()

    if (!id) {
      return NextResponse.json({ error: 'Missing item id' }, { status: 400 })
    }

    const existing = await prisma.item.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const data: any = {}

    if ('sku' in body) data.sku = String(body.sku || '').trim()
    if ('name' in body) data.name = String(body.name || '').trim()

    if ('unitType' in body) {
      if (!['g', 'ml', 'each'].includes(body.unitType)) {
        return NextResponse.json({ error: 'Valid unit type is required' }, { status: 400 })
      }

      data.unitType = body.unitType
    }

    if ('shelfLifeDays' in body) {
      data.shelfLifeDays = nullableNumber(body.shelfLifeDays)
    }

    if ('sellingPrice' in body) {
      data.sellingPrice = nullableNumber(body.sellingPrice)
    }

    if ('standardBatchOutput' in body) {
      data.standardBatchOutput = nullableNumber(body.standardBatchOutput)
    }

    if ('buildStatus' in body) {
      if (!['UNBUILT', 'BUILT'].includes(body.buildStatus)) {
        return NextResponse.json({ error: 'Valid build status is required' }, { status: 400 })
      }

      data.buildStatus = body.buildStatus
    }

    if ('sku' in data && !data.sku) {
      return NextResponse.json({ error: 'SKU is required' }, { status: 400 })
    }

    if ('name' in data && !data.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    if ('shelfLifeDays' in data && (existing.itemType === 'L2' || existing.itemType === 'L3')) {
      if (
        data.shelfLifeDays === null ||
        data.shelfLifeDays <= 0 ||
        Number.isNaN(data.shelfLifeDays)
      ) {
        return NextResponse.json(
          { error: 'Shelf life days is required for L2/L3 items' },
          { status: 400 }
        )
      }
    }

    if ('sellingPrice' in data && existing.itemType !== 'L1') {
      data.sellingPrice = null
    }

    if ('standardBatchOutput' in data && existing.itemType !== 'L2') {
      data.standardBatchOutput = null
    }

    const item = await prisma.item.update({
      where: { id },
      data,
    })

    return NextResponse.json(item)
  } catch (error: any) {
    console.error('PATCH /api/items failed:', error)

    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'That SKU already exists' }, { status: 400 })
    }

    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
  }
}