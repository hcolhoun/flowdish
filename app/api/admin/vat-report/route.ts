import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAdmin, requireTenant, tenantErrorResponse } from '@/lib/tenant'

export async function GET(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canAdmin(tenant.role)) {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    const url = new URL(req.url)
    const now = new Date()
    const defaultStart = `${now.getUTCFullYear()}-01-01`
    const defaultEnd = `${now.getUTCFullYear()}-12-31`
    const startDate = url.searchParams.get('startDate') || defaultStart
    const endDate = url.searchParams.get('endDate') || defaultEnd

    const deliveries = await prisma.delivery.findMany({
      where: {
        restaurantId: tenant.restaurantId,
        deliveredAt: {
          gte: new Date(`${startDate}T00:00:00.000Z`),
          lte: new Date(`${endDate}T23:59:59.999Z`),
        },
      },
      include: {
        item: {
          select: {
            sku: true,
            name: true,
          },
        },
      },
      orderBy: {
        deliveredAt: 'desc',
      },
    })

    const rows = deliveries.map((delivery) => ({
      id: delivery.id,
      deliveredAt: delivery.deliveredAt,
      supplier: delivery.supplier,
      itemSku: delivery.item.sku,
      itemName: delivery.item.name,
      grossAmount: delivery.price ?? 0,
      vatRatePercent: delivery.vatRatePercent,
      vatAmount: delivery.vatAmount,
      netAmount: Math.max(0, (delivery.price ?? 0) - delivery.vatAmount),
      vatReclaimStatus: delivery.vatReclaimStatus,
    }))

    const vatRows = rows.filter((row) => row.vatAmount > 0)

    return NextResponse.json({
      startDate,
      endDate,
      summary: {
        grossPurchases: rows.reduce((sum, row) => sum + row.grossAmount, 0),
        totalVatCharged: vatRows.reduce((sum, row) => sum + row.vatAmount, 0),
        vatClaimed: vatRows
          .filter((row) => row.vatReclaimStatus === 'CLAIMED')
          .reduce((sum, row) => sum + row.vatAmount, 0),
        vatNotClaimed: vatRows
          .filter((row) => row.vatReclaimStatus === 'NOT_CLAIMED')
          .reduce((sum, row) => sum + row.vatAmount, 0),
        vatEligible: vatRows
          .filter((row) => row.vatReclaimStatus === 'ELIGIBLE')
          .reduce((sum, row) => sum + row.vatAmount, 0),
        zeroRatedDeliveryCount: rows.filter((row) => row.vatRatePercent <= 0).length,
      },
      rows,
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/admin/vat-report failed:', error)
    return NextResponse.json({ error: 'Failed to load VAT report.' }, { status: 500 })
  }
}
