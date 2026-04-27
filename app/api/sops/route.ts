import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const itemId = searchParams.get('itemId')

    if (!itemId) {
      return NextResponse.json({ error: 'Missing itemId' }, { status: 400 })
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
    })

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const sop = await prisma.sopDocument.findUnique({
      where: { itemId },
    })

    if (item.itemType === 'L2') {
      const directIngredients = await prisma.bomL2L3.findMany({
        where: { l2ItemId: itemId },
        include: { l3: true },
        orderBy: { id: 'asc' },
      })

      return NextResponse.json({
        item,
        instructions: sop?.instructions ?? '',
        directComponents: [],
        directIngredients: directIngredients.map((row) => ({
          itemId: row.l3.id,
          sku: row.l3.sku,
          name: row.l3.name,
          qty: row.qty,
          unitType: row.l3.unitType,
        })),
        expandedIngredients: directIngredients.map((row) => ({
          parentSku: item.sku,
          parentName: item.name,
          sku: row.l3.sku,
          name: row.l3.name,
          qty: row.qty,
          unitType: row.l3.unitType,
        })),
      })
    }

    if (item.itemType === 'L1') {
      const directComponents = await prisma.bomL1L2.findMany({
        where: { l1ItemId: itemId },
        include: { l2: true },
        orderBy: { id: 'asc' },
      })

      const directIngredients = await prisma.bomL1L3.findMany({
        where: { l1ItemId: itemId },
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

      for (const component of directComponents) {
        const nested = await prisma.bomL2L3.findMany({
          where: { l2ItemId: component.l2.id },
          include: { l3: true },
          orderBy: { id: 'asc' },
        })

        for (const row of nested) {
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

      for (const row of directIngredients) {
        expandedIngredients.push({
          parentSku: item.sku,
          parentName: item.name,
          sku: row.l3.sku,
          name: row.l3.name,
          qty: row.qty,
          unitType: row.l3.unitType,
        })
      }

      return NextResponse.json({
        item,
        instructions: sop?.instructions ?? '',
        directComponents: directComponents.map((row) => ({
          itemId: row.l2.id,
          sku: row.l2.sku,
          name: row.l2.name,
          qty: row.qty,
          unitType: row.l2.unitType,
        })),
        directIngredients: directIngredients.map((row) => ({
          itemId: row.l3.id,
          sku: row.l3.sku,
          name: row.l3.name,
          qty: row.qty,
          unitType: row.l3.unitType,
        })),
        expandedIngredients,
      })
    }

    return NextResponse.json(
      { error: 'SOP is only supported for L1 and L2 items' },
      { status: 400 }
    )
  } catch (error) {
    console.error('GET /api/sops failed:', error)
    return NextResponse.json({ error: 'Failed to load SOP' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const itemId = String(body.itemId || '')
    const instructions = String(body.instructions || '')

    if (!itemId) {
      return NextResponse.json({ error: 'Missing itemId' }, { status: 400 })
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
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

    const sop = await prisma.sopDocument.upsert({
      where: { itemId },
      update: {
        instructions,
      },
      create: {
        itemId,
        instructions,
      },
    })

    return NextResponse.json(sop)
  } catch (error) {
    console.error('POST /api/sops failed:', error)
    return NextResponse.json({ error: 'Failed to save SOP' }, { status: 500 })
  }
}