import { NextResponse } from 'next/server'
import pdf from 'pdf-parse'

function parseMoney(value: string) {
  const cleaned = value.replace('€', '').replace(',', '').trim()
  const number = Number(cleaned)
  return Number.isFinite(number) ? number : null
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const parsed = await pdf(buffer)
    const text = parsed.text

    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

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
      const afterLastPrice = line.split(moneyMatches[moneyMatches.length - 1])[1]?.trim() || ''

      const parts = beforeFirstPrice.split(/\s+/)
      const supplierSku = afterLastPrice.split(/\s+/).pop() || null

      if (parts.length < 3 || !packPrice) continue

      const possibleWeightMatch = beforeFirstPrice.match(/(\d+(?:\.\d+)?\s?(kg|g|ml|l|KG|G|ML|L))$/)
      const weight = possibleWeightMatch ? possibleWeightMatch[1] : null

      const name = beforeFirstPrice
        .replace(weight ?? '', '')
        .replace(/\s+/g, ' ')
        .trim()

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
    return NextResponse.json({ error: 'Failed to parse Caterway PDF' }, { status: 500 })
  }
}