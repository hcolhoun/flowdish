import { NextResponse } from 'next/server'
import { getInventoryLots } from '@/lib/inventory'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const lots = await getInventoryLots()
    return NextResponse.json(lots)
  } catch (error) {
    console.error('GET /api/inventory failed:', error)
    return NextResponse.json({ error: 'Failed to load inventory' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing inventory lot id' }, { status: 400 })
    }

    const lot = await prisma.inventoryLot.findUnique({
      where: { id },
      include: {
        item: true,
        delivery: true,
      },
    })

    if (!lot) {
      return NextResponse.json({ error: 'Inventory lot not found' }, { status: 404 })
    }

    if (lot.qtyRemaining !== lot.qtyInitial) {
      return NextResponse.json(
        {
          error:
            'Cannot delete this inventory lot because some of the stock has already been used. Adjustments should be handled separately.',
        },
        { status: 400 }
      )
    }

    await prisma.inventoryLot.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/inventory failed:', error)
    return NextResponse.json({ error: 'Failed to delete inventory lot' }, { status: 500 })
  }
}