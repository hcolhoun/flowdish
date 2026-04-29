import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') || ''

    if (q.trim().length < 2) {
      return NextResponse.json({
        items: [],
        supplierProducts: [],
      })
    }

    const items = await prisma.item.findMany({
      where: {
        itemType: 'L3',
        name: {
          contains: q,
          mode: 'insensitive',
        },
      },
      take: 10,
      orderBy: { name: 'asc' },
    })

    const supplierProducts = await prisma.supplierProduct.findMany({
      where: {
        name: {
          contains: q,
          mode: 'insensitive',
        },
      },
      take: 10,
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({
      items,
      supplierProducts,
    })
  } catch (error) {
    console.error('GET /api/ingredient-search failed:', error)
    return NextResponse.json(
      { error: 'Ingredient search failed' },
      { status: 500 }
    )
  }
}