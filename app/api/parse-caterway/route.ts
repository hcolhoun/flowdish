export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type ParsedProduct = {
  supplier: string
  supplierSku: string | null
  name: string
  packSize: string | null
  weight: string | null
  packPrice: number | null
  unitPrice: number | null
}

function parseMoney(value: string | undefined | null) {
  if (!value) return null

  const cleaned = value
    .replace('€', '')
    .replaceAll(',', '')
    .trim()

  const number = Number(cleaned)
  return Number.isFinite(number) ? number : null
}

function cleanLine(value: string) {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanName(value: string) {
  return cleanLine(value)
    .replace(
      /Product Family|Product Item Description|Pack Size|Weight|Price|Unit or Kilo|Order Product Code/gi,
      ''
    )
    .replace(/\[A\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikeSku(value: string) {
  return /^[A-Z0-9][A-Z0-9.\/-]{2,}$/.test(value)
}

function extractFinalSku(value: string) {
  const tokens = cleanLine(value).split(/\s+/).filter(Boolean)

  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i].replace(/[^\w.\/-]/g, '')

    if (looksLikeSku(token)) {
      return token
    }
  }

  return null
}

function extractWeight(value: string) {
  const matches = Array.from(
    value.matchAll(/(\d+(?:\.\d+)?\s?(?:kg|Kg|KG|g|G|ml|ML|l|L|ltr|Ltr|LTR|litre|Litre|Liter|liter))\b/g)
  )

  if (matches.length === 0) return null

  return matches[matches.length - 1][1]
}

function normaliseWeight(value: string | null) {
  if (!value) return null

  return value
    .replace(/\s+/g, '')
    .replace(/Ltr|LTR|Litre|Liter|litre|liter/g, 'l')
    .replace(/KG/g, 'kg')
    .replace(/G/g, 'g')
    .replace(/ML/g, 'ml')
    .replace(/Kg/g, 'kg')
}

function removeWeightFromName(name: string, weight: string | null) {
  if (!weight) return name

  const escaped = weight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const flexible = escaped.replace(/\\ /g, '\\s?')

  return cleanLine(name.replace(new RegExp(flexible, 'i'), ''))
}

function stripAccidentalPreviousUnpricedRow(value: string) {
  let cleaned = cleanLine(value)

  /*
    PDF text can occasionally become:
    "Beans Borlotti Bag25kg DBEABOR1 Beans Haricot BagCoco Blanc5kg"
    before the price.

    This strips everything through the previous uppercase SKU if that SKU is
    followed by more product text.
  */
  cleaned = cleaned.replace(/^.*\b[A-Z]{2,}[A-Z0-9.\/-]{2,}\s+(?=[A-Za-z])/, '')

  return cleanLine(cleaned)
}

function stripKnownCategoryPrefix(value: string) {
  const knownPrefixes = [
    'Vegetables',
    'Fruits',
    'Salads',
    'Prepared Produce',
    'Herbs Fresh',
    'Washed Salads',
    'Dairy',
    'Herb & Spice Dried',
    'Savory Grocery',
    'Savoury Grocery',
    'Bakery',
    'Frozen',
    'Dry Goods',
  ]

  let cleaned = cleanLine(value)

  for (const prefix of knownPrefixes) {
    if (cleaned.toLowerCase().startsWith(prefix.toLowerCase() + ' ')) {
      cleaned = cleanLine(cleaned.slice(prefix.length))
    }
  }

  return cleaned
}

function inferPackSize(value: string) {
  const cleaned = cleanLine(value)

  const packWords = [
    'Box',
    'Bag',
    'Net',
    'Pre-Pack',
    'Bunch',
    'Unit',
    'Loose',
    'Retail',
    'Vac Pack',
    'Bottle',
    'Tub',
    'Tin',
    'Jar',
    'Pack',
    'Tray',
    'Carton',
  ]

  for (const word of packWords) {
    const regex = new RegExp(`\\b${word.replace(' ', '\\s+')}\\b(?:\\s+x?\\s?\\d+)?`, 'i')
    const match = cleaned.match(regex)

    if (match) return cleanLine(match[0])
  }

  return null
}

function parsePricedLine(rawLine: string): ParsedProduct | null {
  let line = cleanLine(rawLine)

  if (!line.includes('€')) return null
  if (/Tel\s*:/i.test(line)) return null
  if (/Product Price List/i.test(line)) return null
  if (/The Buyer/i.test(line)) return null
  if (/Page \d+ of \d+/i.test(line)) return null
  if (/Printed\s*:/i.test(line)) return null
  if (/Denotes a Product/i.test(line)) return null
  if (/Please Contact/i.test(line)) return null
  if (/Product Family Product Item Description/i.test(line)) return null

  const moneyMatches = Array.from(line.matchAll(/€\s?\d+(?:,\d{3})*(?:\.\d{1,2})?/g))

  if (moneyMatches.length < 1) return null

  const firstMoney = moneyMatches[0][0]
  const firstMoneyIndex = moneyMatches[0].index ?? -1

  if (firstMoneyIndex <= 0) return null

  const beforeFirstPriceRaw = line.slice(0, firstMoneyIndex).trim()
  const afterFirstPriceRaw = line.slice(firstMoneyIndex + firstMoney.length).trim()

  const supplierSku = extractFinalSku(afterFirstPriceRaw)

  if (!supplierSku) return null

  const secondMoneyMatch = afterFirstPriceRaw.match(/€\s?\d+(?:,\d{3})*(?:\.\d{1,2})?/)
  const packPrice = parseMoney(firstMoney)
  const unitPrice = secondMoneyMatch ? parseMoney(secondMoneyMatch[0]) : null

  if (!packPrice || packPrice <= 0) return null

  let beforePrice = stripKnownCategoryPrefix(beforeFirstPriceRaw)
  beforePrice = stripAccidentalPreviousUnpricedRow(beforePrice)

  /*
    If a merged line still contains a previous SKU anywhere before the product,
    keep only the text after the final previous SKU.
  */
  beforePrice = beforePrice.replace(/^.*\b[A-Z]{2,}[A-Z0-9.\/-]{2,}\s+(?=[A-Za-z])/, '')

  const weight = normaliseWeight(extractWeight(beforePrice))
  const packSize = inferPackSize(beforePrice)

  let name = beforePrice

  if (weight) {
    name = removeWeightFromName(name, weight)
  }

  name = cleanName(name)

  /*
    Remove pack words from the very end only when they are just formatting,
    but keep useful product wording.
  */
  name = name
    .replace(/\b(Box|Bag|Net|Pre-Pack|Pack|Tub|Tin|Jar|Bottle|Tray|Carton)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!name || name.length < 3) return null
  if (looksLikeSku(name)) return null

  return {
    supplier: 'Caterway',
    supplierSku,
    name,
    packSize,
    weight,
    packPrice,
    unitPrice,
  }
}

function dedupeParsedProducts(products: ParsedProduct[]) {
  const map = new Map<string, ParsedProduct>()
  let duplicateCount = 0

  for (const product of products) {
    const key = product.supplierSku
      ? `${product.supplier.toLowerCase()}::${product.supplierSku.toLowerCase()}`
      : `${product.supplier.toLowerCase()}::${product.name.toLowerCase()}`

    const existing = map.get(key)

    if (existing) {
      duplicateCount++

      map.set(key, {
        supplier: product.supplier || existing.supplier,
        supplierSku: product.supplierSku || existing.supplierSku,
        name: product.name || existing.name,
        packSize: product.packSize || existing.packSize,
        weight: product.weight || existing.weight,
        packPrice: product.packPrice ?? existing.packPrice,
        unitPrice: product.unitPrice ?? existing.unitPrice,
      })
    } else {
      map.set(key, product)
    }
  }

  return {
    products: Array.from(map.values()),
    duplicateCount,
  }
}

function buildCandidateLines(text: string) {
  const rawLines = text
    .split(/\r?\n/)
    .map((line: string) => cleanLine(line))
    .filter(Boolean)

  const candidates: string[] = []

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]

    candidates.push(line)

    /*
      Some PDF rows wrap across lines. Only join small windows when there is
      a price nearby. This helps rows like split pack sizes without creating
      full-page false matches.
    */
    const next = rawLines[i + 1]
    const next2 = rawLines[i + 2]

    if (next) candidates.push(cleanLine(`${line} ${next}`))
    if (next && next2) candidates.push(cleanLine(`${line} ${next} ${next2}`))
  }

  return Array.from(new Set(candidates))
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

    const candidates = buildCandidateLines(text)
    const parsedProducts: ParsedProduct[] = []

    for (const line of candidates) {
      const product = parsePricedLine(line)

      if (product) {
        parsedProducts.push(product)
      }
    }

    const { products, duplicateCount } = dedupeParsedProducts(parsedProducts)

    return NextResponse.json({
      products,
      count: products.length,
      duplicateCount,
    })
  } catch (error) {
    console.error('POST /api/parse-caterway failed:', error)
    return NextResponse.json(
      { error: 'Failed to parse Caterway PDF' },
      { status: 500 }
    )
  }
}