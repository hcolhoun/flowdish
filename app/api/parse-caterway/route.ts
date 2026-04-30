export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

function parseMoney(value: string | undefined | null) {
  if (!value) return null
  const cleaned = value.replace('€', '').replace(',', '').trim()
  const number = Number(cleaned)
  return Number.isFinite(number) ? number : null
}

function cleanName(value: string) {
  return value
    .replace(/Product Family|Product Item Description|Pack Size|Weight|Price|Unit or Kilo|Order Product Code/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function POST(req: Request) {
  try {
    const pdf = require('pdf-parse/lib/pdf-parse.js')

    const formData = await req.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const parsed = await pdf(buffer)
    const text = String(parsed.text || '')

    const lines = text
      .split(/\r?\n/)
      .map((line: string) => line.trim())
      .filter(Boolean)

    const products: any[] = []

    for (const line of lines) {
      if (!line.includes('€')) continue
      if (line.includes('Tel :')) continue
      if (line.includes('Product Price List')) continue
      if (line.includes('The Buyer')) continue
      if (line.includes('Page ')) continue
      if (line.includes('Printed')) continue
      if (line.includes('Denotes a Product')) continue

      const moneyMatches = line.match(/€\s?\d+(?:\.\d{1,2})?/g)
      if (!moneyMatches || moneyMatches.length < 1) continue

      const packPrice = parseMoney(moneyMatches[0])
      const unitPrice = moneyMatches[1] ? parseMoney(moneyMatches[1]) : null

      if (!packPrice) continue

      const beforePrice = line.split(moneyMatches[0])[0].trim()
      const afterPrice = line.split(moneyMatches[moneyMatches.length - 1])[1]?.trim() || ''

      const afterParts = afterPrice.split(/\s+/).filter(Boolean)
      const supplierSku = afterParts.length > 0 ? afterParts[afterParts.length - 1] : null

      const weightMatch = beforePrice.match(/(\d+(?:\.\d+)?\s?(kg|g|ml|l|KG|G|ML|L))$/)
      const weight = weightMatch ? weightMatch[1] : null

      const name = cleanName(beforePrice.replace(weight ?? '', ''))

      if (!name || name.length < 3) continue

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

    // fallback: if PDF text came out as one huge block
    if (products.length === 0) {
      const compact = text.replace(/\s+/g, ' ')
      const regex =
        /([A-Za-z][A-Za-z0-9\s\/\-\.\[\]&]+?)\s+(Box|Bag|Net|Pre-Pack|Bunch|Unit|Loose|Retail|Vac Pack)?\s*([^€]{0,40})\s+(€\s?\d+(?:\.\d{1,2})?)\s+(€\s?\d+(?:\.\d{1,2})?|---)?\s+([A-Z0-9\.]+)\b/g

      let match

      while ((match = regex.exec(compact)) !== null) {
        const name = cleanName(`${match[1]} ${match[2] || ''} ${match[3] || ''}`)
        const packPrice = parseMoney(match[4])
        const unitPrice = match[5]?.includes('€') ? parseMoney(match[5]) : null
        const supplierSku = match[6]

        if (!name || !packPrice || !supplierSku) continue

        products.push({
          supplier: 'Caterway',
          supplierSku,
          name,
          packSize: match[2] || null,
          weight: null,
          packPrice,
          unitPrice,
        })
      }
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