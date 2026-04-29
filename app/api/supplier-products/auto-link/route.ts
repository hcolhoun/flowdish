import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export async function POST() {
  try {
    const [supplierProducts, l3Items] = await Promise.all([
      prisma.supplierProduct.findMany({
        where: { linkedItemId: null },
      }),
      prisma.item.findMany({
        where: { itemType: 'L3' },
      }),
    ])

    let linkedCount = 0

    for (const product of supplierProducts as any[]) {
      const productName = normalize(product.name)

      const exactSkuMatch = l3Items.find(
        (item: any) =>
          product.supplierSku &&
          normalize(item.sku) === normalize(product.supplierSku)
      )

      const nameMatch = l3Items.find((item: any) => {
        const itemName = normalize(item.name)
        return productName.includes(itemName) || itemName.includes(productName)
      })

      const match = exactSkuMatch || nameMatch

      if (match) {
        await prisma.supplierProduct.update({
          where: { id: product.id },
          data: { linkedItemId: match.id },
        })

        linkedCount++
      }
    }

    return NextResponse.json({
      success: true,
      linkedCount,
      checkedCount: supplierProducts.length,
    })
  } catch (error) {
    console.error('POST /api/supplier-products/auto-link failed:', error)
    return NextResponse.json({ error: 'Auto-link failed' }, { status: 500 })
  }
}