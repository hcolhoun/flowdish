import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type BomRowInput = {
  childId: string
  qty: number
}

function buildAdjacency(
  rows: Array<{ parentL2ItemId: string; childL2ItemId: string }>
) {
  const map = new Map<string, string[]>()

  for (const row of rows) {
    const existing = map.get(row.parentL2ItemId) ?? []
    existing.push(row.childL2ItemId)
    map.set(row.parentL2ItemId, existing)
  }

  return map
}

function canReachTarget(
  startId: string,
  targetId: string,
  adjacency: Map<string, string[]>
) {
  const seen = new Set<string>()
  const stack = [startId]

  while (stack.length > 0) {
    const current = stack.pop()

    if (!current) continue
    if (current === targetId) return true
    if (seen.has(current)) continue

    seen.add(current)

    const children = adjacency.get(current) ?? []
    stack.push(...children)
  }

  return false
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const parentId = searchParams.get('parentId')

    if (!parentId) {
      return NextResponse.json({ error: 'Missing parentId' }, { status: 400 })
    }

    const rows = await prisma.bomL2L2.findMany({
      where: { parentL2ItemId: parentId },
      include: {
        parentL2: true,
        childL2: true,
      },
      orderBy: { id: 'asc' },
    })

    return NextResponse.json(rows)
  } catch (error) {
    console.error('GET /api/bom/l2-l2 failed:', error)
    return NextResponse.json({ error: 'Failed to load L2 -> L2 BOM' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const parentId = String(body.parentId || '')
    const rows = Array.isArray(body.rows) ? (body.rows as BomRowInput[]) : []

    if (!parentId) {
      return NextResponse.json({ error: 'Missing parentId' }, { status: 400 })
    }

    const parentItem = await prisma.item.findUnique({
      where: { id: parentId },
    })

    if (!parentItem || parentItem.itemType !== 'L2') {
      return NextResponse.json({ error: 'Parent must be an L2 item' }, { status: 400 })
    }

    const cleanRows = rows
      .filter((row) => row.childId && Number(row.qty) > 0)
      .map((row) => ({
        childId: String(row.childId),
        qty: Number(row.qty),
      }))

    for (const row of cleanRows) {
      if (row.childId === parentId) {
        return NextResponse.json(
          { error: 'An L2 item cannot contain itself.' },
          { status: 400 }
        )
      }

      const childItem = await prisma.item.findUnique({
        where: { id: row.childId },
      })

      if (!childItem || childItem.itemType !== 'L2') {
        return NextResponse.json(
          { error: 'Every child row must be an L2 item.' },
          { status: 400 }
        )
      }
    }

    const existingRows = await prisma.bomL2L2.findMany({
      where: {
        parentL2ItemId: {
          not: parentId,
        },
      },
      select: {
        parentL2ItemId: true,
        childL2ItemId: true,
      },
    })

    const proposedRows = cleanRows.map((row) => ({
      parentL2ItemId: parentId,
      childL2ItemId: row.childId,
    }))

    const adjacency = buildAdjacency([...existingRows, ...proposedRows])

    for (const row of proposedRows) {
      if (canReachTarget(row.childL2ItemId, parentId, adjacency)) {
        return NextResponse.json(
          {
            error:
              'This would create a circular L2 recipe. Example: A contains B and B eventually contains A.',
          },
          { status: 400 }
        )
      }
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.bomL2L2.deleteMany({
        where: { parentL2ItemId: parentId },
      })

      if (cleanRows.length > 0) {
        await tx.bomL2L2.createMany({
          data: cleanRows.map((row) => ({
            parentL2ItemId: parentId,
            childL2ItemId: row.childId,
            qty: row.qty,
          })),
        })
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('POST /api/bom/l2-l2 failed:', error)
    return NextResponse.json({ error: 'Failed to save L2 -> L2 BOM' }, { status: 500 })
  }
}