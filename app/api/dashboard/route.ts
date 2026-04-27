import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const now = new Date()
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const [
      totalItems,
      totalInventoryLots,
      inventoryLots,
      recentDeliveries,
      recentPrep,
      recentSales,
      recentWaste,
      l2Items,
      sales,
      deliveries,
      waste,
    ] = await Promise.all([
      prisma.item.count(),
      prisma.inventoryLot.count(),
      prisma.inventoryLot.findMany({
        where: { qtyRemaining: { gt: 0 } },
        include: { item: true },
        orderBy: { expiryAt: 'asc' },
      }),
      prisma.delivery.findMany({
        take: 5,
        orderBy: { deliveredAt: 'desc' },
        include: { item: true },
      }),
      prisma.prepBatch.findMany({
        take: 5,
        orderBy: { preparedAt: 'desc' },
        include: { item: true },
      }),
      prisma.sale.findMany({
        take: 5,
        orderBy: { soldAt: 'desc' },
        include: { item: true },
      }),
      prisma.waste.findMany({
        take: 5,
        orderBy: { date: 'desc' },
        include: { item: true },
      }),
      prisma.item.findMany({
        where: { itemType: 'L2' },
      }),
      prisma.sale.findMany({
        include: { item: true },
      }),
      prisma.delivery.findMany(),
      prisma.waste.findMany(),
    ])

    const totalRevenue = sales.reduce(
      (sum: number, sale: any) =>
        sum + sale.qty * (sale.item?.sellingPrice ?? 0),
      0
    )

    const totalCogs = sales.reduce(
      (sum: number, sale: any) => sum + (sale.cost ?? 0),
      0
    )

    const grossProfit = totalRevenue - totalCogs

    const grossMarginPercent =
      totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

    // Delivery.price now means TOTAL DELIVERY COST, not unit price.
    const totalSpend = deliveries.reduce(
      (sum: number, d: any) => sum + (d.price ?? 0),
      0
    )

    const stockValue = inventoryLots.reduce(
      (sum: number, lot: any) =>
        sum + lot.qtyRemaining * (lot.unitCost ?? 0),
      0
    )

    const wasteCost = waste.reduce((sum: number, w: any) => {
      const lot = inventoryLots.find((l: any) => l.itemId === w.itemId)
      return sum + w.qty * (lot?.unitCost ?? 0)
    }, 0)

    const wastePercent =
      totalSpend > 0 ? (wasteCost / totalSpend) * 100 : 0

    const baselineWastePercent = 10

    const estimatedSavings =
      totalSpend > 0
        ? Math.max(
            0,
            ((baselineWastePercent - wastePercent) / 100) * totalSpend
          )
        : 0

    const expiringSoon = inventoryLots
      .filter((lot: any) => lot.expiryAt && lot.expiryAt <= in7Days)
      .slice(0, 10)
      .map((lot: any) => ({
        id: lot.id,
        sku: lot.item.sku,
        name: lot.item.name,
        qtyRemaining: lot.qtyRemaining,
        unitType: lot.unitType,
        expiryAt: lot.expiryAt,
        value: lot.qtyRemaining * (lot.unitCost ?? 0),
      }))

    const expiringSoonValue = expiringSoon.reduce(
      (sum: number, lot: any) => sum + lot.value,
      0
    )

    const lowStockL2 = l2Items
      .map((item: any) => {
        const lots = inventoryLots.filter(
          (lot: any) => lot.itemId === item.id
        )

        const totalQty = lots.reduce(
          (sum: number, lot: any) => sum + lot.qtyRemaining,
          0
        )

        return {
          itemId: item.id,
          sku: item.sku,
          name: item.name,
          totalQty,
          unitType: item.unitType,
        }
      })
      .filter((item: any) => item.totalQty <= 0)
      .slice(0, 10)

    const profitMap = new Map()

    for (const sale of sales as any[]) {
      const revenue = sale.qty * (sale.item?.sellingPrice ?? 0)
      const cogs = sale.cost ?? 0

      const existing = profitMap.get(sale.itemId)

      if (!existing) {
        profitMap.set(sale.itemId, {
          itemId: sale.itemId,
          sku: sale.item.sku,
          name: sale.item.name,
          qtySold: sale.qty,
          revenue,
          cogs,
          profit: revenue - cogs,
          marginPercent:
            revenue > 0 ? ((revenue - cogs) / revenue) * 100 : 0,
        })
      } else {
        existing.qtySold += sale.qty
        existing.revenue += revenue
        existing.cogs += cogs
        existing.profit = existing.revenue - existing.cogs
        existing.marginPercent =
          existing.revenue > 0
            ? (existing.profit / existing.revenue) * 100
            : 0
      }
    }

    const profitByItem = Array.from(profitMap.values()).sort(
      (a: any, b: any) => b.profit - a.profit
    )

    return NextResponse.json({
      totals: {
        totalItems,
        totalInventoryLots,
        inventorySkusOnHand: inventoryLots.length,
        expiringSoonCount: expiringSoon.length,
      },
      financials: {
        totalRevenue,
        totalCogs,
        grossProfit,
        grossMarginPercent,
        totalSpend,
        stockValue,
        wasteCost,
        wastePercent,
        expiringSoonValue,
        estimatedSavings,
        baselineWastePercent,
      },
      profitByItem,
      lowStockL2,
      expiringSoon,
      recentDeliveries,
      recentPrep,
      recentSales,
      recentWaste,
    })
  } catch (error) {
    console.error('GET /api/dashboard failed:', error)
    return NextResponse.json(
      { error: 'Failed to load dashboard' },
      { status: 500 }
    )
  }
}