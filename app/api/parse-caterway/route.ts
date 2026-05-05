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

const CATEGORY_WORDS = [
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
  'Green Cuisine',
  'Citrus',
  'Root',
  'Stone',
  'Berries',
  'Apples',
  'Cress',
  'Leaf baby',
  'Lettuce Specialty',
  'Mushrooms Wild',
  'Chinese veg',
  'Exotic',
  'Cucurbits',
  'Capsicum',
  'Brassica',
  'Beans & Peas',
  'Baby veg',
  'Asparagus',
  'Artichoke',
  'Fresh Juice',
  'Prep Fruit',
  'Prep Veges',
  'Prep Potato',
  'Prep Turnip',
  'Prep Onion',
  'Prep Parsnip',
  'Prep Mixes',
  'Prep Celeriac',
  'Dried Various',
  'Dried Bulk',
  'Oils & Vinegar',
  'Tinned/Bottled Veg',
  'Tinned/Bottled',
  'Mayonaise and Sauces',
  'Salts & Peppers',
  '100g Herbs',
  'g Herbs',
  'KILO',
  'Herbs',
]

function cleanLine(value: string) {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanPdfText(value: string) {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\r/g, '\n')
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

function looksLikeDecimalPrice(value: string) {
  return /^\d+\.\d{1,4}$/.test(value.trim())
}

function looksLikeValidSku(value: string | null | undefined) {
  if (!value) return false

  const cleaned = value.trim()

  if (!cleaned) return false
  if (looksLikeDecimalPrice(cleaned)) return false
  if (!/^[A-Z0-9][A-Z0-9./-]{2,}$/i.test(cleaned)) return false

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

function stripBoilerplate(value: string) {
  return cleanLine(value)
    .replace(/Product Price List/gi, ' ')
    .replace(/Product Family/gi, ' ')
    .replace(/Product Item Description/gi, ' ')
    .replace(/Pack Size/gi, ' ')
    .replace(/Order Product Code/gi, ' ')
    .replace(/Unit or Kilo/gi, ' ')
    .replace(/The Buyer[^\n]*/gi, ' ')
    .replace(/Printed\s*:[^\n]*/gi, ' ')
    .replace(/Page \d+ of \d+/gi, ' ')
    .replace(/Tel\s*:[^\n]*/gi, ' ')
    .replace(/\[A\]\s*Denotes a Product Item that Contains Allergens or is an Allergen/gi, ' ')
    .replace(/Please Contact the Sales Office if you require Further Information/gi, ' ')
    .replace(/\d{1,2}(st|nd|rd|th)\s+[A-Za-z]+\s+\d{4}\.?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripCategoryPrefixes(value: string) {
  let cleaned = cleanLine(value)

  let changed = true

  while (changed) {
    changed = false

    for (const category of CATEGORY_WORDS) {
      const escaped = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
      const regex = new RegExp(`^${escaped}\\s*`, 'i')

      if (regex.test(cleaned)) {
        cleaned = cleanLine(cleaned.replace(regex, ''))
        changed = true
      }
    }
  }

  return cleaned
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

function stripEarlierMergedRows(value: string) {
  let cleaned = cleanLine(value)

  /*
    If the candidate contains an earlier unpriced row like:
    "Beans Borlotti Bag25kg DBEABOR1 Beans Haricot BagCoco Blanc5kg"
    strip everything up to the previous SKU.
  */
  cleaned = cleaned.replace(/^.*\b[A-Z][A-Z0-9./-]{2,}\s+(?=[A-Za-z])/, '')

  /*
    If the prefix is still very long, use the tail. Product descriptions in this file
    are normally short; very long prefixes usually mean merged PDF text.
  */
  if (cleaned.length > 160) {
    cleaned = cleanLine(cleaned.slice(-160))
    cleaned = cleaned.replace(/^.*\b[A-Z][A-Z0-9./-]{2,}\s+(?=[A-Za-z])/, '')
  }

  return cleaned
}

function hasSkuInsideName(value: string) {
  const tokens = cleanLine(value)
    .split(/\s+/)
    .map((token) => token.replace(/^[^\w]+|[^\w./-]+$/g, ''))
    .filter(Boolean)

  return tokens.some((token) => looksLikeValidSku(token))
}

function looksLikePackOnlyName(value: string) {
  const cleaned = cleanLine(value)

  if (!cleaned) return true

  return /^(bag|bagx|box|boxx|carton|cartonx|pre-pack|pre-packx|pack|packx|tin|tinx|jar|jarx|tub|tubx|bottle|bottlex|tray|trayx|net|netx|unit|unitx|bunch|bunchx)(\s|$|x|\d)/i.test(
    cleaned
  )
}

function hasHumanText(value: string) {
  return /[A-Za-z]{3,}/.test(value)
}

function cleanProductName(rawName: string, weight: string | null) {
  let name = cleanLine(rawName)

  name = stripBoilerplate(name)
  name = stripEarlierMergedRows(name)
  name = stripCategoryPrefixes(name)
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

  if (!product.name || product.name.length < 3) return 'name too short'
  if (!hasHumanText(product.name)) return 'name does not contain product text'
  if (looksLikePackOnlyName(product.name)) return 'name is pack-only'
  if (hasSkuInsideName(product.name)) return 'name contains another SKU, likely merged row'

  if (!product.packPrice || product.packPrice <= 0) return 'missing pack price'

  const euroCount = (raw.match(/€/g) ?? []).length
  if (euroCount > 2) return 'too many prices in candidate row'

  return null
}

function parseCandidate(rawCandidate: string): { product: ParsedProduct | null; rejection?: RejectedRow } {
  const candidate = cleanLine(rawCandidate)

  if (!candidate.includes('€')) {
    return { product: null }
  }

  const moneyMatches = Array.from(
    candidate.matchAll(/€\s?\d+(?:,\d{3})*(?:\.\d{1,2})?/g)
  )

  if (moneyMatches.length < 1) {
    return {
      product: null,
      rejection: { reason: 'no valid price token', raw: candidate },
    }
  }

  if (moneyMatches.length > 2) {
    return {
      product: null,
      rejection: { reason: 'too many price tokens', raw: candidate },
    }
  }

  const firstMoney = moneyMatches[0][0]
  const firstMoneyIndex = moneyMatches[0].index ?? -1

  if (firstMoneyIndex <= 0) {
    return {
      product: null,
      rejection: { reason: 'price appears before product name', raw: candidate },
    }
  }

  const beforePriceRaw = candidate.slice(0, firstMoneyIndex).trim()
  const afterPriceRaw = candidate.slice(firstMoneyIndex + firstMoney.length).trim()

  const packPrice = parseMoney(firstMoney)
  const unitPrice = moneyMatches[1] ? parseMoney(moneyMatches[1][0]) : null
  const supplierSku = extractFinalSku(afterPriceRaw)

  if (!supplierSku) {
    return {
      product: null,
      rejection: { reason: 'missing final supplier SKU', raw: candidate },
    }
  }

  const weight = normaliseWeight(extractWeight(beforePriceRaw))
  const packSize = inferPackSize(beforePriceRaw)
  const name = cleanProductName(beforePriceRaw, weight)

  const product: ParsedProduct = {
    supplier: 'Caterway',
    supplierSku,
    name,
    packSize,
    weight,
    packPrice,
    unitPrice,
  }

  const rejectionReason = validateParsedProduct(product, candidate)

  if (rejectionReason) {
    return {
      product: null,
      rejection: { reason: rejectionReason, raw: candidate },
    }
  }

  return { product }
}

function buildLineCandidates(text: string) {
  return text
    .split(/\r?\n/)
    .map((line: string) => cleanLine(line))
    .filter(Boolean)
    .filter((line: string) => line.includes('€'))
}

function buildCompactCandidates(text: string) {
  const compact = cleanLine(text.replace(/\r?\n/g, ' '))
  const candidates: string[] = []

  /*
    Find every "€price optional-unit-price SKU" ending, then take the text
    between the previous product end and this price as the product description.
  */
  const priceSkuRegex =
    /€\s?\d+(?:,\d{3})*(?:\.\d{1,2})?(?:\s+(?:€\s?\d+(?:,\d{3})*(?:\.\d{1,2})?|---))?\s+([A-Z0-9][A-Z0-9./-]{2,})\b/gi

  let previousEnd = 0
  let match: RegExpExecArray | null

  while ((match = priceSkuRegex.exec(compact)) !== null) {
    const priceStart = match.index
    const priceAndSku = match[0]

    let prefix = compact.slice(previousEnd, priceStart)

    /*
      Keep only the useful tail. This avoids carrying page/category text
      forward into the product name.
    */
    if (prefix.length > 220) {
      prefix = prefix.slice(-220)
    }

    const candidate = cleanLine(`${prefix} ${priceAndSku}`)

    if (candidate.includes('€')) {
      candidates.push(candidate)
    }

    previousEnd = match.index + match[0].length
  }

  return candidates
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
    products: Array.from(map.values()).sort((a, b) =>
      String(a.supplierSku || '').localeCompare(String(b.supplierSku || ''))
    ),
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
    const text = cleanPdfText(String(parsed.text || ''))

    const candidates = Array.from(
      new Set([...buildLineCandidates(text), ...buildCompactCandidates(text)])
    )

    const parsedProducts: ParsedProduct[] = []
    const rejectedRows: RejectedRow[] = []

    for (const candidate of candidates) {
      const result = parseCandidate(candidate)

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