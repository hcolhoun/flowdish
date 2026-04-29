import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const products = await prisma.supplierProduct.findMany({
      include: { linkedItem: true },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(products)
  } catch (error) {
    console.error('GET /api/supplier-products failed:', error)
    return NextResponse.json(
      { error: 'Failed to load supplier products' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const products = body.products

    if (!Array.isArray(products)) {
      return NextResponse.json({ error: 'Products must be an array' }, { status: 400 })
    }

    await prisma.supplierProduct.createMany({
      data: products.map((product: any) => ({
        supplier: String(product.supplier || ''),
        supplierSku: product.supplierSku ? String(product.supplierSku) : null,
        name: String(product.name || ''),
        packSize: product.packSize ? String(product.packSize) : null,
        weight: product.weight ? String(product.weight) : null,
        packPrice:
          product.packPrice === null || product.packPrice === undefined || product.packPrice === ''
            ? null
            : Number(product.packPrice),
        unitPrice:
          product.unitPrice === null || product.unitPrice === undefined || product.unitPrice === ''
            ? null
            : Number(product.unitPrice),
      })),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('POST /api/supplier-products failed:', error)
    return NextResponse.json(
      { error: 'Failed to save supplier products' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()

    const id = String(body.id || '')
    const linkedItemId = body.linkedItemId ? String(body.linkedItemId) : null

    if (!id) {
      return NextResponse.json({ error: 'Missing supplier product id' }, { status: 400 })
    }

    const product = await prisma.supplierProduct.update({
      where: { id },
      data: { linkedItemId },
      include: { linkedItem: true },
    })

    return NextResponse.json(product)
  } catch (error) {
    console.error('PATCH /api/supplier-products failed:', error)
    return NextResponse.json(
      { error: 'Failed to update supplier product link' },
      { status: 500 }
    )
  }
}