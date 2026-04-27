import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const parentId = searchParams.get('parentId')

    if (!parentId) {
      return NextResponse.json({ error: 'Missing parentId' }, { status: 400 })
    }

    const rows = await prisma.bomL2L3.findMany({
      where: { l2ItemId: parentId },
      include: {
        l2: true,
        l3: true,
      },
      orderBy: { id: 'asc' },
    })

    return NextResponse.json(rows)
  } catch (error) {
    console.error('GET /api/bom/l2-l3 failed:', error)
    return NextResponse.json({ error: 'Failed to load L2 -> L3 BOM' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const parentId = body.parentId as string
    const rows = body.rows as Array<{
      childId: string
      qty: number
    }>

    if (!parentId) {
      return NextResponse.json({ error: 'Missing parentId' }, { status: 400 })
    }

    await prisma.bomL2L3.deleteMany({
      where: { l2ItemId: parentId },
    })

    if (rows && rows.length > 0) {
      await prisma.bomL2L3.createMany({
        data: rows
          .filter((row) => row.childId && Number(row.qty) > 0)
          .map((row) => ({
            l2ItemId: parentId,
            l3ItemId: row.childId,
            qty: Number(row.qty),
          })),
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('POST /api/bom/l2-l3 failed:', error)
    return NextResponse.json({ error: 'Failed to save L2 -> L3 BOM' }, { status: 500 })
  }
}