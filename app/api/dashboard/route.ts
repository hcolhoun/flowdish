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
        orderBy: [{ expiryAt: 'asc' }],
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
        orderBy: { name: 'asc' },
      }),
      prisma.sale.findMany({
        include: { item: true },
      }),
      prisma.delivery.findMany({
        include: { item: true },
      }),
      prisma.waste.findMany({
        include: { item: true },
      }),
    ])

    const totalRevenue = sales.reduce((sum, sale) => {
      return sum + sale.qty * (sale.item.sellingPrice ?? 0)
    }, 0)

    const totalCogs = sales.reduce((sum, sale) => {
      return sum + (sale.cost ?? 0)
    }, 0)

    const grossProfit = totalRevenue - totalCogs
    const grossMarginPercent =
      totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

    const totalSpend = deliveries.reduce((sum, delivery) => {
      return sum + delivery.qty * (delivery.price ?? 0)
    }, 0)

    const stockValue = inventoryLots.reduce((sum, lot) => {
      return sum + lot.qtyRemaining * (lot.unitCost ?? 0)
    }, 0)

    const wasteCost = waste.reduce((sum, wasteRow) => {
      const lotsForItem = inventoryLots.filter((lot) => lot.itemId === wasteRow.itemId)
      const latestCost = lotsForItem.length > 0 ? lotsForItem[0].unitCost ?? 0 : 0
      return sum + wasteRow.qty * latestCost
    }, 0)

    const wastePercent = totalSpend > 0 ? (wasteCost / totalSpend) * 100 : 0

    const baselineWastePercent = 10
    const estimatedSavings =
      totalSpend > 0
        ? Math.max(0, ((baselineWastePercent - wastePercent) / 100) * totalSpend)
        : 0

    const inventorySummaryMap = new Map<
      string,
      {
        itemId: string
        sku: string
        name: string
        unitType: string
        totalQty: number
        nextExpiry: Date | null
      }
    >()

    for (const lot of inventoryLots) {
      const existing = inventorySummaryMap.get(lot.itemId)

      if (!existing) {
        inventorySummaryMap.set(lot.itemId, {
          itemId: lot.itemId,
          sku: lot.item.sku,
          name: lot.item.name,
          unitType: lot.unitType,
          totalQty: lot.qtyRemaining,
          nextExpiry: lot.expiryAt,
        })
      } else {
        existing.totalQty += lot.qtyRemaining
        if (lot.expiryAt && (!existing.nextExpiry || lot.expiryAt < existing.nextExpiry)) {
          existing.nextExpiry = lot.expiryAt
        }
      }
    }

    const inventorySummary = Array.from(inventorySummaryMap.values())

    const expiringSoon = inventoryLots
      .filter((lot) => lot.expiryAt && lot.expiryAt <= in7Days)
      .map((lot) => ({
        id: lot.id,
        sku: lot.item.sku,
        name: lot.item.name,
        qtyRemaining: lot.qtyRemaining,
        unitType: lot.unitType,
        expiryAt: lot.expiryAt,
        value: lot.qtyRemaining * (lot.unitCost ?? 0),
      }))
      .slice(0, 10)

    const expiringSoonValue = expiringSoon.reduce((sum, lot) => sum + lot.value, 0)

    const lowStockL2 = l2Items
      .map((item) => {
        const lots = inventoryLots.filter((lot) => lot.itemId === item.id)
        const totalQty = lots.reduce((sum, lot) => sum + lot.qtyRemaining, 0)

        return {
          itemId: item.id,
          sku: item.sku,
          name: item.name,
          totalQty,
          unitType: item.unitType,
        }
      })
      .filter((item) => item.totalQty <= 0)
      .slice(0, 10)

    const profitByItemMap = new Map<
      string,
      {
        itemId: string
        sku: string
        name: string
        qtySold: number
        revenue: number
        cogs: number
        profit: number
        marginPercent: number
      }
    >()

    for (const sale of sales) {
      const revenue = sale.qty * (sale.item.sellingPrice ?? 0)
      const cogs = sale.cost ?? 0
      const existing = profitByItemMap.get(sale.itemId)

      if (!existing) {
        profitByItemMap.set(sale.itemId, {
          itemId: sale.itemId,
          sku: sale.item.sku,
          name: sale.item.name,
          qtySold: sale.qty,
          revenue,
          cogs,
          profit: revenue - cogs,
          marginPercent: revenue > 0 ? ((revenue - cogs) / revenue) * 100 : 0,
        })
      } else {
        existing.qtySold += sale.qty
        existing.revenue += revenue
        existing.cogs += cogs
        existing.profit = existing.revenue - existing.cogs
        existing.marginPercent =
          existing.revenue > 0 ? (existing.profit / existing.revenue) * 100 : 0
      }
    }

    const profitByItem = Array.from(profitByItemMap.values()).sort(
      (a, b) => b.profit - a.profit
    )

    return NextResponse.json({
      totals: {
        totalItems,
        totalInventoryLots,
        inventorySkusOnHand: inventorySummary.length,
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
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 })
  }
}