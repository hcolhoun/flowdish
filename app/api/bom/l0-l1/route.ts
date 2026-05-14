import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const parentId = searchParams.get('parentId')

    if (!parentId) {
      return NextResponse.json({ error: 'Missing parentId' }, { status: 400 })
    }

    const rows = await prisma.bomL0L1.findMany({
      where: { l0ItemId: parentId },
      include: {
        l0: true,
        l1: true,
      },
      orderBy: { id: 'asc' },
    })

    return NextResponse.json(rows)
  } catch (error) {
    console.error('GET /api/bom/l0-l1 failed:', error)
    return NextResponse.json({ error: 'Failed to load L0 -> L1 BOM' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const parentId = String(body.parentId || '')
    const rows = Array.isArray(body.rows)
      ? (body.rows as Array<{
          childId: string
          qty: number
        }>)
      : []

    if (!parentId) {
      return NextResponse.json({ error: 'Missing parentId' }, { status: 400 })
    }

    const parent = await prisma.item.findUnique({
      where: { id: parentId },
    })

    if (!parent) {
      return NextResponse.json({ error: 'L0 item not found' }, { status: 404 })
    }

    if (parent.itemType !== 'L0') {
      return NextResponse.json({ error: 'Parent item must be L0' }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.bomL0L1.deleteMany({
        where: { l0ItemId: parentId },
      })

      const cleanRows = rows
        .filter((row) => row.childId && Number(row.qty) > 0)
        .map((row) => ({
          l0ItemId: parentId,
          l1ItemId: row.childId,
          qty: Number(row.qty),
        }))

      if (cleanRows.length > 0) {
        await tx.bomL0L1.createMany({
          data: cleanRows,
          skipDuplicates: true,
        })
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('POST /api/bom/l0-l1 failed:', error)
    return NextResponse.json({ error: 'Failed to save L0 -> L1 BOM' }, { status: 500 })
  }
}