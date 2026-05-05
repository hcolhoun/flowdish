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

type RejectedRow = {
  reason: string
  raw: string
}

const PACK_WORDS = [
  'Bag',
  'Box',
  'Carton',
  'Pre-Pack',
  'Pack',
  'Net',
  'Tin',
  'Jar',
  'Tub',
  'Bottle',
  'Tray',
  'Bunch',
  'Unit',
  'Loose',
  'Retail',
  'Vac Pack',
  'Block',
  'Bucket',
  'Sack',
]

const BAD_TEXT_PATTERNS = [
  /Product Price List/i,
  /Product Family/i,
  /Product Item Description/i,
  /Pack Size/i,
  /Order Product Code/i,
  /Unit or Kilo/i,
  /The Buyer/i,
  /Printed\s*:/i,
  /Page \d+ of \d+/i,
  /Tel\s*:/i,
  /Denotes a Product/i,
  /Please Contact/i,
  /Sales Office/i,
  /Further Information/i,
  /\bst April 2026\b/i,
]

function cleanLine(value: string) {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function parseMoney(value: string | null | undefined) {
  if (!value) return null

  const cleaned = value
    .replace('€', '')
    .replaceAll(',', '')
    .trim()

  const number = Number(cleaned)

  return Number.isFinite(number) ? number : null
}

function looksLikeBadBoilerplate(value: string) {
  return BAD_TEXT_PATTERNS.some((pattern) => pattern.test(value))
}

function looksLikeDecimalPrice(value: string) {
  return /^\d+\.\d{1,4}$/.test(value.trim())
}

function looksLikeValidSku(value: string) {
  const cleaned = value.trim()

  if (!cleaned) return false
  if (looksLikeDecimalPrice(cleaned)) return false
  if (!/^[A-Z0-9][A-Z0-9./-]{2,}$/i.test(cleaned)) return false

  /*
    Caterway does have a few numeric SKUs like 7428 / 7744.
    Allow integer-only codes only when they are at least 4 digits.
  */
  if (/^\d+$/.test(cleaned)) {
    return cleaned.length >= 4
  }

  return /[A-Z]/i.test(cleaned)
}

function extractFinalSku(value: string) {
  const tokens = cleanLine(value)
    .split(/\s+/)
    .map((token) => token.replace(/^[^\w]+|[^\w./-]+$/g, ''))
    .filter(Boolean)

  for (let i = tokens.length - 1; i >= 0; i--) {
    if (looksLikeValidSku(tokens[i])) return tokens[i]
  }

  return null
}

function extractWeight(value: string) {
  const matches = Array.from(
    value.matchAll(
      /(\d+(?:\.\d+)?\s?(?:kg|Kg|KG|g|G|gram|grams|ml|ML|l|L|ltr|Ltr|LTR|litre|Litre|Liter|liter|cl|CL))\b/g
    )
  )

  if (matches.length === 0) return null

  return matches[matches.length - 1][1]
}

function normaliseWeight(value: string | null) {
  if (!value) return null

  return value
    .replace(/\s+/g, '')
    .replace(/grams?/i, 'g')
    .replace(/Ltr|LTR|Litre|Liter|litre|liter/i, 'l')
    .replace(/KG|Kg/i, 'kg')
    .replace(/ML/i, 'ml')
    .replace(/CL/i, 'cl')
    .replace(/G\b/i, 'g')
}

function inferPackSize(value: string) {
  const cleaned = cleanLine(value)

  for (const word of PACK_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    const regex = new RegExp(`\\b${escaped}\\b(?:\\s*x?\\s?\\d+)?`, 'i')
    const match = cleaned.match(regex)

    if (match) return cleanLine(match[0])
  }

  return null
}

function stripKnownPrefixes(value: string) {
  return cleanLine(value)
    .replace(/^(Vegetables|Fruits|Salads|Prepared Produce|Herbs Fresh|Washed Salads|Dairy|Herb & Spice Dried|Savory Grocery|Savoury Grocery|Bakery|Frozen|Dry Goods|Green Cuisine|Citrus|Root|Stone|Berries|Apples|Cress|Leaf baby|Lettuce Specialty|Mushrooms Wild|Chinese veg|Exotic|Cucurbits|Capsicum|Brassica|Beans & Peas|Baby veg|Asparagus|Artichoke|Fresh Juice|Prep Fruit|Prep Veges|Prep Potato|Prep Turnip|Prep Onion|Prep Parsnip|Prep Mixes|Prep Celeriac|Dried Various|Dried Bulk|Oils & Vinegar|Tinned\/Bottled Veg|Tinned\/Bottled|Mayonaise and Sauces|Salts & Peppers|100g Herbs|g Herbs|KILO|Herbs)\s*/i, '')
    .trim()
}

function stripAllergenMarker(value: string) {
  return cleanLine(value)
    .replace(/\[A\]/gi, '')
    .replace(/\bA\]\s*/gi, '')
    .trim()
}

function removeWeightFromName(name: string, weight: string | null) {
  if (!weight) return name

  const escaped = weight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const flexible = escaped.replace(/\\ /g, '\\s?')

  return cleanLine(name.replace(new RegExp(flexible, 'i'), ''))
}

function removePackNoiseFromEnd(name: string) {
  let cleaned = cleanLine(name)

  for (const word of PACK_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    cleaned = cleanLine(cleaned.replace(new RegExp(`\\b${escaped}\\s*$`, 'i'), ''))
  }

  return cleaned
}

function hasSkuInsideName(value: string) {
  const tokens = cleanLine(value)
    .split(/\s+/)
    .map((token) => token.replace(/^[^\w]+|[^\w./-]+$/g, ''))
    .filter(Boolean)

  /*
    If a parsed name still contains a code like DBEABOR1 or TOMV10,
    it is almost certainly a merged row.
  */
  return tokens.some((token) => looksLikeValidSku(token))
}

function looksLikePackOnlyName(value: string) {
  const cleaned = cleanLine(value)

  if (!cleaned) return true

  return /^(bag|bagx|box|boxx|carton|cartonx|pre-pack|pre-packx|pack|packx|tin|tinx|jar|jarx|tub|tubx|bottle|bottlex|tray|trayx|net|netx|unit|unitx|bunch|bunchx)(\s|$|x|\d)/i.test(
    cleaned
  )
}

function hasEnoughHumanText(value: string) {
  const words = cleanLine(value)
    .split(/\s+/)
    .filter((word) => /[A-Za-z]{3,}/.test(word))

  return words.length >= 2
}

function cleanProductName(rawName: string, weight: string | null) {
  let name = cleanLine(rawName)

  name = stripKnownPrefixes(name)
  name = stripAllergenMarker(name)
  name = removeWeightFromName(name, weight)
  name = removePackNoiseFromEnd(name)

  name = name
    .replace(/\bProduct\s*Code\b/gi, '')
    .replace(/\bPackSize\b/gi, '')
    .replace(/\bOrderProduct\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  return name
}

function validateParsedProduct(product: ParsedProduct, raw: string): string | null {
  if (!product.supplierSku) return 'missing supplier SKU'
  if (!looksLikeValidSku(product.supplierSku)) return 'invalid supplier SKU'
  if (looksLikeDecimalPrice(product.supplierSku)) return 'supplier SKU looks like price'

  if (!product.name || product.name.length < 6) return 'name too short'
  if (looksLikePackOnlyName(product.name)) return 'name is pack-only'
  if (!hasEnoughHumanText(product.name)) return 'name does not contain enough product text'
  if (looksLikeBadBoilerplate(product.name)) return 'name contains boilerplate'
  if (hasSkuInsideName(product.name)) return 'name contains another SKU, likely merged row'

  if (!product.packPrice || product.packPrice <= 0) return 'missing pack price'

  /*
    Reject obvious merged rows where multiple euro signs appear in the raw line.
    A valid row should have pack price and maybe one unit/kilo price.
  */
  const euroCount = (raw.match(/€/g) ?? []).length
  if (euroCount > 2) return 'too many prices in candidate row'

  return null
}

function parsePricedLine(rawLine: string): { product: ParsedProduct | null; rejection?: RejectedRow } {
  const line = cleanLine(rawLine)

  if (!line.includes('€')) {
    return { product: null }
  }

  if (looksLikeBadBoilerplate(line)) {
    return {
      product: null,
      rejection: { reason: 'boilerplate/header/footer', raw: line },
    }
  }

  const moneyMatches = Array.from(line.matchAll(/€\s?\d+(?:,\d{3})*(?:\.\d{1,2})?/g))

  if (moneyMatches.length < 1) {
    return {
      product: null,
      rejection: { reason: 'no valid price token', raw: line },
    }
  }

  if (moneyMatches.length > 2) {
    return {
      product: null,
      rejection: { reason: 'too many price tokens', raw: line },
    }
  }

  const firstMoney = moneyMatches[0][0]
  const firstMoneyIndex = moneyMatches[0].index ?? -1

  if (firstMoneyIndex <= 0) {
    return {
      product: null,
      rejection: { reason: 'price appears before product name', raw: line },
    }
  }

  const beforePriceRaw = line.slice(0, firstMoneyIndex).trim()
  const afterPriceRaw = line.slice(firstMoneyIndex + firstMoney.length).trim()

  const packPrice = parseMoney(firstMoney)
  const unitPrice = moneyMatches[1] ? parseMoney(moneyMatches[1][0]) : null
  const supplierSku = extractFinalSku(afterPriceRaw)

  if (!supplierSku) {
    return {
      product: null,
      rejection: { reason: 'missing final supplier SKU', raw: line },
    }
  }

  /*
    Reject lines where the supposed SKU occurs before the price as well.
    That usually means this candidate merged an unpriced previous row with the next priced row.
  */
  if (new RegExp(`\\b${supplierSku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(beforePriceRaw)) {
    return {
      product: null,
      rejection: { reason: 'supplier SKU appears before price, likely merged row', raw: line },
    }
  }

  const beforePrice = stripKnownPrefixes(beforePriceRaw)
  const weight = normaliseWeight(extractWeight(beforePrice))
  const packSize = inferPackSize(beforePrice)
  const name = cleanProductName(beforePrice, weight)

  const product: ParsedProduct = {
    supplier: 'Caterway',
    supplierSku,
    name,
    packSize,
    weight,
    packPrice,
    unitPrice,
  }

  const rejectionReason = validateParsedProduct(product, line)

  if (rejectionReason) {
    return {
      product: null,
      rejection: { reason: rejectionReason, raw: line },
    }
  }

  return { product }
}

function buildCandidateLines(text: string) {
  /*
    IMPORTANT:
    We intentionally do NOT join neighbouring lines anymore.
    Joining caused garbage merged products and polluted L3s.
    This parser now prefers missing a few products over creating bad L3s.
  */
  return text
    .split(/\r?\n/)
    .map((line: string) => cleanLine(line))
    .filter(Boolean)
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
    const rejectedRows: RejectedRow[] = []

    for (const line of candidates) {
      const result = parsePricedLine(line)

      if (result.product) {
        parsedProducts.push(result.product)
      }

      if (result.rejection) {
        rejectedRows.push(result.rejection)
      }
    }

    const { products, duplicateCount } = dedupeParsedProducts(parsedProducts)

    return NextResponse.json({
      products,
      count: products.length,
      duplicateCount,
      rejectedCount: rejectedRows.length,
      rejectedRows: rejectedRows.slice(0, 100),
    })
  } catch (error) {
    console.error('POST /api/parse-caterway failed:', error)
    return NextResponse.json(
      { error: 'Failed to parse Caterway PDF' },
      { status: 500 }
    )
  }
}