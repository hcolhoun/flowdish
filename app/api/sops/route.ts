import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

async function buildSop(itemId: string) {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
  })

  if (!item) {
    return null
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

    return {
      item,
      instructions: sop?.instructions ?? '',
      updatedAt: sop?.updatedAt ?? null,
      directComponents: [],
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

    for (const component of directComponents as any[]) {
      const nested = await prisma.bomL2L3.findMany({
        where: { l2ItemId: component.l2.id },
        include: { l3: true },
        orderBy: { id: 'asc' },
      })

      for (const row of nested as any[]) {
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
    const { searchParams } = new URL(req.url)
    const itemId = searchParams.get('itemId')

    if (!itemId) {
      const sops = await prisma.sopDocument.findMany({
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

    const result = await buildSop(itemId)

    if (!result) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json(result)
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

    await prisma.sopDocument.upsert({
      where: { itemId },
      update: { instructions },
      create: { itemId, instructions },
    })

    const fullSop = await buildSop(itemId)

    return NextResponse.json(fullSop)
  } catch (error) {
    console.error('POST /api/sops failed:', error)
    return NextResponse.json({ error: 'Failed to save SOP' }, { status: 500 })
  }
}