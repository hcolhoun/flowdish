export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type BaseUnit = 'g' | 'ml' | 'each'

function parseMoney(value: string | undefined | null) {
  if (!value) return null

  const cleaned = value
    .replace('€', '')
    .replace(/,/g, '')
    .trim()

  const number = Number(cleaned)
  return Number.isFinite(number) ? number : null
}

function cleanName(value: string) {
  return value
    .replace(/Product Family|Product Item Description|Pack Size|Weight|Price|Unit or Kilo|Order Product Code/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractWeight(value: string) {
  const matches = Array.from(
    value.matchAll(/(\d+(?:\.\d+)?\s?(?:kg|g|ml|l|KG|G|ML|L))\b/g)
  )

  if (matches.length === 0) return null

  return matches[matches.length - 1][1]
}

function parseWeightToBaseAmount(weight: string | null | undefined): {
  amount: number
  unitType: BaseUnit
} | null {
  if (!weight) return null

  const cleaned = weight.trim().toLowerCase().replace(',', '.')
  const match = cleaned.match(/(\d+(?:\.\d+)?)\s?(kg|g|ml|l)\b/)

  if (!match) return null

  const amount = Number(match[1])
  const unit = match[2]

  if (!Number.isFinite(amount) || amount <= 0) return null

  if (unit === 'kg') return { amount: amount * 1000, unitType: 'g' }
  if (unit === 'g') return { amount, unitType: 'g' }
  if (unit === 'l') return { amount: amount * 1000, unitType: 'ml' }
  if (unit === 'ml') return { amount, unitType: 'ml' }

  return null
}

/**
 * Caterway's second price column is "Unit or Kilo".
 *
 * For kg/g products, that means €/kg.
 * Flowdish BOMs use grams, so convert €/kg -> €/g.
 *
 * For l/ml products, treat it as €/l and convert €/l -> €/ml.
 *
 * If no parsed unit/kilo price exists, fall back to packPrice / parsed pack weight.
 */
function calculateBaseUnitPrice({
  packPrice,
  weight,
  parsedUnitOrKiloPrice,
}: {
  packPrice: number | null
  weight: string | null
  parsedUnitOrKiloPrice: number | null
}) {
  const parsedWeight = parseWeightToBaseAmount(weight)

  if (
    parsedUnitOrKiloPrice !== null &&
    parsedUnitOrKiloPrice !== undefined &&
    Number.isFinite(parsedUnitOrKiloPrice) &&
    parsedUnitOrKiloPrice > 0
  ) {
    if (parsedWeight?.unitType === 'g') {
      return parsedUnitOrKiloPrice / 1000
    }

    if (parsedWeight?.unitType === 'ml') {
      return parsedUnitOrKiloPrice / 1000
    }

    return parsedUnitOrKiloPrice
  }

  if (packPrice && parsedWeight && parsedWeight.amount > 0) {
    return packPrice / parsedWeight.amount
  }

  return null
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

      const moneyMatches = line.match(/€\s?\d+(?:,\d{3})*(?:\.\d{1,2})?/g)
      if (!moneyMatches || moneyMatches.length < 1) continue

      const packPrice = parseMoney(moneyMatches[0])
      const parsedUnitOrKiloPrice = moneyMatches[1] ? parseMoney(moneyMatches[1]) : null

      if (!packPrice) continue

      const beforePrice = line.split(moneyMatches[0])[0].trim()
      const afterPrice = line.split(moneyMatches[moneyMatches.length - 1])[1]?.trim() || ''

      const afterParts = afterPrice.split(/\s+/).filter(Boolean)
      const supplierSku = afterParts.length > 0 ? afterParts[afterParts.length - 1] : null

      const weight = extractWeight(beforePrice)
      const name = cleanName(beforePrice.replace(weight ?? '', ''))

      if (!name || name.length < 3) continue

      const unitPrice = calculateBaseUnitPrice({
        packPrice,
        weight,
        parsedUnitOrKiloPrice,
      })

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

    if (products.length === 0) {
      const compact = text.replace(/\s+/g, ' ')
      const regex =
        /([A-Za-z][A-Za-z0-9\s\/\-\.\[\]&]+?)\s+(Box|Bag|Net|Pre-Pack|Bunch|Unit|Loose|Retail|Vac Pack)?\s*([^€]{0,60})\s+(€\s?\d+(?:,\d{3})*(?:\.\d{1,2})?)\s+(€\s?\d+(?:,\d{3})*(?:\.\d{1,2})?|---)?\s+([A-Z0-9\.]+)\b/g

      let match

      while ((match = regex.exec(compact)) !== null) {
        const rawName = `${match[1]} ${match[2] || ''} ${match[3] || ''}`
        const weight = extractWeight(rawName)
        const name = cleanName(rawName.replace(weight ?? '', ''))

        const packPrice = parseMoney(match[4])
        const parsedUnitOrKiloPrice = match[5]?.includes('€') ? parseMoney(match[5]) : null
        const supplierSku = match[6]

        if (!name || !packPrice || !supplierSku) continue

        const unitPrice = calculateBaseUnitPrice({
          packPrice,
          weight,
          parsedUnitOrKiloPrice,
        })

        products.push({
          supplier: 'Caterway',
          supplierSku,
          name,
          packSize: match[2] || null,
          weight,
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