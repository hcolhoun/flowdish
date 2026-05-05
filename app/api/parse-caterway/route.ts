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

type RejectedRow = ParsedProduct & {
  reason: string
  raw: string
  include?: boolean
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

  const number = Number(value.replace('€', '').replaceAll(',', '').trim())

  return Number.isFinite(number) ? number : null
}

function looksLikeValidSku(value: string | null | undefined) {
  if (!value) return false

  const cleaned = value.trim()

  if (!cleaned) return false
  if (/^\d+\.\d+$/.test(cleaned)) return false

  if (/^\d+$/.test(cleaned)) return cleaned.length >= 4

  return /^[A-Z0-9][A-Z0-9./-]{1,}$/i.test(cleaned) && /[A-Z]/i.test(cleaned)
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
    .replace(/^.*?\bOrderProduct Code\b\s*/i, '')
    .replace(/^.*?\bOrder Product Code\b\s*/i, '')
    .replace(/^.*?\bUnit or Kilo Price\b\s*/i, '')
    .replace(/Product Price List/gi, ' ')
    .replace(/Product Family/gi, ' ')
    .replace(/Product Item Description/gi, ' ')
    .replace(/Pack Size/gi, ' ')
    .replace(/PackSize/gi, ' ')
    .replace(/Order Product Code/gi, ' ')
    .replace(/OrderProduct Code/gi, ' ')
    .replace(/Unit or Kilo/gi, ' ')
    .replace(/The Buyer[^.]*\./gi, ' ')
    .replace(/Printed\s*:[^.]*\./gi, ' ')
    .replace(/Page \d+ of \d+/gi, ' ')
    .replace(/Tel\s*:[^.]*\./gi, ' ')
    .replace(/\[A\]\s*Denotes a Product Item that Contains Allergens or is an Allergen/gi, ' ')
    .replace(/A\]\s*Denotes a Product Item that Contains Allergens or is an Allergen/gi, ' ')
    .replace(/Please Contact the Sales Office if you require Further Information/gi, ' ')
    .replace(/\d{1,2}(st|nd|rd|th)\s+[A-Za-z]+\s+\d{4}\.?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripCategoryNoise(value: string) {
  return cleanLine(value)
    .replace(/^(Vegetables|Fruits|Salads|Prepared Produce|Herbs Fresh|Washed Salads|Dairy|Herb & Spice Dried|Savory Grocery|Savoury Grocery|Dried Bulk|Dried Various|Green Cuisine|Fresh Juice|Citrus|Root|Stone|Berries|Apples|Cress|Leaf baby|Lettuce Specialty|Mushrooms Wild|Chinese veg|Exotic|Cucurbits|Capsicum|Brassica|Beans & Peas|Baby veg|Asparagus|Artichoke|100g Herbs|g Herbs|KILO|Herbs)\s*/i, '')
    .trim()
}

function stripAllergenMarker(value: string) {
  return cleanLine(value)
    .replace(/\[A\]/gi, '')
    .replace(/\bA\]\s*/gi, '')
    .trim()
}

function cleanRepeatedCategoryPrefix(value: string) {
  return cleanLine(value.replace(/^([A-Z][a-z]+)\1\b/, '$1 '))
}

function removeWeightFromName(name: string, weight: string | null) {
  if (!weight) return name

  const escaped = weight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const flexible = escaped.replace(/\\ /g, '\\s?')

  return cleanLine(name.replace(new RegExp(flexible, 'i'), ''))
}

function removeTrailingPackOnly(name: string) {
  let cleaned = cleanLine(name)

  for (const word of PACK_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')

    cleaned = cleanLine(cleaned.replace(new RegExp(`\\b${escaped}\\s*$`, 'i'), ''))
  }

  return cleaned
}

function cleanProductName(rawName: string, weight: string | null) {
  return removeTrailingPackOnly(
    removeWeightFromName(
      cleanRepeatedCategoryPrefix(
        stripAllergenMarker(stripCategoryNoise(stripBoilerplate(rawName)))
      ),
      weight
    )
  )
}

function looksLikePackOnlyName(value: string) {
  return /^(bag|bagx|box|boxx|carton|cartonx|pre-pack|pre-packx|pack|packx|tin|tinx|jar|jarx|tub|tubx|bottle|bottlex|tray|trayx|net|netx|unit|unitx|bunch|bunchx)(\s|$|x|\d)/i.test(
    cleanLine(value)
  )
}

function containsObviousBoilerplate(value: string) {
  return (
    /Denotes a Product/i.test(value) ||
    /Please Contact/i.test(value) ||
    /Sales Office/i.test(value) ||
    /Further Information/i.test(value) ||
    /Product Family/i.test(value) ||
    /Product Item Description/i.test(value) ||
    /OrderProduct Code/i.test(value) ||
    /Order Product Code/i.test(value)
  )
}

function containsMergedSku(value: string, ownSku: string | null) {
  const tokens = cleanLine(value)
    .split(/\s+/)
    .map((token) => token.replace(/^[^\w]+|[^\w./-]+$/g, ''))
    .filter(Boolean)

  return tokens.some((token) => {
    if (!looksLikeValidSku(token)) return false
    if (ownSku && token.toLowerCase() === ownSku.toLowerCase()) return false
    if (/^(box|bag|pack|carton|tin|jar|tub|bottle|tray|net|unit|bunch)x?\d*/i.test(token)) return false
    if (/\d+(kg|g|ml|l|ltr|cl)$/i.test(token)) return false
    if (/^\d+x\d+/i.test(token)) return false

    return true
  })
}

function getRejectionReason(product: ParsedProduct, raw: string) {
  if (!product.supplierSku || !looksLikeValidSku(product.supplierSku)) {
    return 'Invalid or missing supplier SKU'
  }

  if (!product.name || product.name.length < 3) {
    return 'Missing product name'
  }

  if (!/[A-Za-z]{3,}/.test(product.name)) {
    return 'Product name does not contain enough text'
  }

  if (looksLikePackOnlyName(product.name)) {
    return 'Product name looks like pack text only'
  }

  if (!product.packPrice || product.packPrice <= 0) {
    return 'Missing pack price'
  }

  if (containsObviousBoilerplate(product.name) || containsObviousBoilerplate(raw)) {
    return 'Contains PDF header/footer text'
  }

  if (containsMergedSku(product.name, product.supplierSku)) {
    return 'Name appears to contain another SKU, likely merged PDF row'
  }

  return ''
}

function parseCandidate(candidate: string): {
  product: ParsedProduct | null
  rejected: RejectedRow | null
} {
  const row = cleanLine(candidate)

  const rowRegex =
    /^(.*?)\s+€\s?(\d+(?:,\d{3})*(?:\.\d{1,2})?)(?:\s+(?:€\s?(\d+(?:,\d{3})*(?:\.\d{1,2})?)|---))?\s+([A-Z0-9][A-Z0-9./-]{1,})\b/i

  const match = row.match(rowRegex)

  if (!match) {
    return {
      product: null,
      rejected: {
        supplier: 'Caterway',
        supplierSku: null,
        name: '',
        packSize: null,
        weight: null,
        packPrice: null,
        unitPrice: null,
        reason: 'Could not match Caterway row format',
        raw: row,
        include: false,
      },
    }
  }

  const beforePriceRaw = match[1]
  const packPrice = parseMoney(`€${match[2]}`)
  const unitPrice = match[3] ? parseMoney(`€${match[3]}`) : null
  const supplierSku = match[4]?.trim() || null

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

  const rejectionReason = getRejectionReason(product, row)

  if (rejectionReason) {
    return {
      product: null,
      rejected: {
        ...product,
        reason: rejectionReason,
        raw: row,
        include: false,
      },
    }
  }

  return { product, rejected: null }
}

function buildCompactCandidates(text: string) {
  const compact = cleanLine(text.replace(/\r?\n/g, ' '))
  const candidates: string[] = []

  const priceSkuRegex =
    /€\s?\d+(?:,\d{3})*(?:\.\d{1,2})?(?:\s*(?:€\s?\d+(?:,\d{3})*(?:\.\d{1,2})?|---))?\s*([A-Z0-9][A-Z0-9./-]{1,})\b/gi

  let previousEnd = 0
  let match: RegExpExecArray | null

  while ((match = priceSkuRegex.exec(compact)) !== null) {
    const priceStart = match.index
    const priceAndSku = match[0]

    let prefix = compact.slice(previousEnd, priceStart)

    if (prefix.length > 260) {
      prefix = prefix.slice(-260)
    }

    const candidate = cleanLine(`${prefix} ${priceAndSku}`)

    if (candidate.includes('€')) {
      candidates.push(candidate)
    }

    previousEnd = match.index + match[0].length
  }

  return candidates
}

function dedupeProducts(products: ParsedProduct[]) {
  const map = new Map<string, ParsedProduct>()
  let duplicateCount = 0

  for (const product of products) {
    const key = `${product.supplier.toLowerCase()}::${String(product.supplierSku || '').toLowerCase()}`

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
    const text = String(parsed.text || '')

    const candidates = buildCompactCandidates(text)

    const parsedProducts: ParsedProduct[] = []
    const rejectedRows: RejectedRow[] = []

    for (const candidate of candidates) {
      const result = parseCandidate(candidate)

      if (result.product) parsedProducts.push(result.product)
      if (result.rejected) rejectedRows.push(result.rejected)
    }

    const { products, duplicateCount } = dedupeProducts(parsedProducts)

    return NextResponse.json({
      products,
      count: products.length,
      duplicateCount,
      rejectedCount: rejectedRows.length,
      rejectedRows: rejectedRows.slice(0, 300),
      debug: {
        textLength: text.length,
        candidateCount: candidates.length,
        sampleCandidates: candidates.slice(0, 10),
      },
    })
  } catch (error) {
    console.error('POST /api/parse-caterway failed:', error)
    return NextResponse.json(
      { error: 'Failed to parse Caterway PDF' },
      { status: 500 }
    )
  }
}