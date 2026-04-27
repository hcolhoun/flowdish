import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

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

    const sku = String(body.sku || '').trim()
    const name = String(body.name || '').trim()
    const itemType = body.itemType
    const unitType = body.unitType

    const shelfLifeDays =
      body.shelfLifeDays === null || body.shelfLifeDays === ''
        ? null
        : Number(body.shelfLifeDays)

    const sellingPrice =
      body.sellingPrice === null || body.sellingPrice === ''
        ? null
        : Number(body.sellingPrice)

    const standardBatchOutput =
      body.standardBatchOutput === null || body.standardBatchOutput === ''
        ? null
        : Number(body.standardBatchOutput)

    if (!sku) {
      return NextResponse.json({ error: 'SKU is required' }, { status: 400 })
    }

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    if (!['L1', 'L2', 'L3'].includes(itemType)) {
      return NextResponse.json({ error: 'Valid item type is required' }, { status: 400 })
    }

    if (!['g', 'ml', 'each'].includes(unitType)) {
      return NextResponse.json({ error: 'Valid unit type is required' }, { status: 400 })
    }

    if (itemType === 'L1') {
      if (sellingPrice === null || sellingPrice <= 0 || Number.isNaN(sellingPrice)) {
        return NextResponse.json(
          { error: 'Selling price is required for L1 items' },
          { status: 400 }
        )
      }
    }

    if (itemType === 'L2') {
      if (shelfLifeDays === null || shelfLifeDays <= 0 || Number.isNaN(shelfLifeDays)) {
        return NextResponse.json(
          { error: 'Shelf life days is required for L2 items' },
          { status: 400 }
        )
      }

      if (
        standardBatchOutput === null ||
        standardBatchOutput <= 0 ||
        Number.isNaN(standardBatchOutput)
      ) {
        return NextResponse.json(
          { error: 'Standard batch output is required for L2 items' },
          { status: 400 }
        )
      }
    }

    if (itemType === 'L3') {
      if (shelfLifeDays === null || shelfLifeDays <= 0 || Number.isNaN(shelfLifeDays)) {
        return NextResponse.json(
          { error: 'Shelf life days is required for L3 items' },
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

    const item = await prisma.item.findUnique({
      where: { id },
    })

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const [
      bomL1AsParent,
      bomL2AsChild,
      bomL1AsParentL3,
      bomL3AsChildL1,
      bomL2AsParentL3,
      bomL3AsChildL2,
      deliveries,
      inventoryLots,
      prepBatches,
      sales,
      wastes,
      forecastLines,
    ] = await Promise.all([
      prisma.bomL1L2.count({ where: { l1ItemId: id } }),
      prisma.bomL1L2.count({ where: { l2ItemId: id } }),
      prisma.bomL1L3.count({ where: { l1ItemId: id } }),
      prisma.bomL1L3.count({ where: { l3ItemId: id } }),
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
      bomL1AsParent +
      bomL2AsChild +
      bomL1AsParentL3 +
      bomL3AsChildL1 +
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

    await prisma.item.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/items failed:', error)
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 })
  }
}