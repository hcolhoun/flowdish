export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

function parseMoney(value: string) {
  const cleaned = value.replace('€', '').replace(',', '').trim()
  const number = Number(cleaned)
  return Number.isFinite(number) ? number : null
}

export async function POST(req: Request) {
  try {
    const canvas = await import('@napi-rs/canvas')

    ;(globalThis as any).DOMMatrix = canvas.DOMMatrix
    ;(globalThis as any).ImageData = canvas.ImageData
    ;(globalThis as any).Path2D = canvas.Path2D

    const { PDFParse } = await import('pdf-parse')

    const formData = await req.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    const parser = new PDFParse({ data: buffer })
    const parsed = await parser.getText()
    const text = parsed.text

    const lines = text
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => Boolean(line))

    const products: any[] = []

    for (const line of lines) {
      if (!line.includes('€')) continue
      if (line.includes('Product Family')) continue
      if (line.includes('Page ')) continue
      if (line.includes('Printed')) continue

      const moneyMatches = line.match(/€\s?\d+(?:\.\d{1,2})?/g)
      if (!moneyMatches || moneyMatches.length === 0) continue

      const packPrice = parseMoney(moneyMatches[0])
      const unitPrice = moneyMatches[1] ? parseMoney(moneyMatches[1]) : null

      const beforeFirstPrice = line.split(moneyMatches[0])[0].trim()
      const afterLastPrice =
        line.split(moneyMatches[moneyMatches.length - 1])[1]?.trim() || ''

      const supplierSku = afterLastPrice.split(/\s+/).pop() || null

      if (!packPrice) continue

      const possibleWeightMatch = beforeFirstPrice.match(
        /(\d+(?:\.\d+)?\s?(kg|g|ml|l|KG|G|ML|L))$/
      )

      const weight = possibleWeightMatch ? possibleWeightMatch[1] : null

      const name = beforeFirstPrice
        .replace(weight ?? '', '')
        .replace(/\s+/g, ' ')
        .trim()

      if (!name) continue

      products.push({
        supplier: 'Caterway',
        supplierSku,
        name,
        packSize: null,
        weight,
        packPrice,
        unitPrice,
      })
    }

    return NextResponse.json(products)
  } catch (error) {
    console.error('POST /api/parse-caterway failed:', error)
    return NextResponse.json(
      { error: 'Failed to parse Caterway PDF' },
      { status: 500 }
    )
  }
}