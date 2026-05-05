export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type ParsedProduct = {
  supplier: string
  supplierSku: string
  name: string
  packSize: string | null
  weight: string | null
  packPrice: number | null
  unitPrice: number | null
  rawUnitPrice: number | null
  baseUnit: 'g' | 'ml' | 'each'
  pricePerBaseUnit: number | null
  pricePerSupplierUnit: number | null
  supplierUnitLabel: string | null
  warnings: string[]
  raw: string
}

function parseMoney(value: string | undefined | null) {
  if (!value) return null

  const cleaned = value
    .replace('€', '')
    .replace(/,/g, '')
    .trim()

  if (cleaned === '---') return null

  const number = Number(cleaned)
  return Number.isFinite(number) ? number : null
}

function round(value: number, places = 6) {
  return Number(value.toFixed(places))
}

function normaliseSpace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function stripPdfBoilerplate(value: string) {
  let next = value

  const cutMarkers = [
    'Product FamilyProduct Item DescriptionPackSizeWeightPrice Unit or Kilo Price OrderProduct Code',
    'Product Family Product Item Description PackSize Weight Price Unit or Kilo Price OrderProduct Code',
    'Product Item DescriptionPackSizeWeightPrice Unit or Kilo Price OrderProduct Code',
    'Product Item Description PackSize Weight Price Unit or Kilo Price OrderProduct Code',
    'PackSizeWeightPrice Unit or Kilo Price OrderProduct Code',
    'PackSize Weight Price Unit or Kilo Price OrderProduct Code',
    'OrderProduct Code',
    'Order Product Code',
  ]

  for (const marker of cutMarkers) {
    const index = next.indexOf(marker)
    if (index >= 0) {
      next = next.slice(index + marker.length)
    }
  }

  next = next
    .replace(/Caterway\s+E-Mail\s*:\s*orders@caterway\.ie/gi, ' ')
    .replace(/orders@caterway\.ie/gi, ' ')
    .replace(/Tel\s*:\s*0035318728000/gi, ' ')
    .replace(/Product Price List/gi, ' ')
    .replace(/The Buyer at Tenjim Ltd t\/a Magpie Inn/gi, ' ')
    .replace(/as of [A-Za-z]+,\s*\d{1,2}(st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4}/gi, ' ')
    .replace(/Denotes a Product Item that Contains Allergens or is an Allergen/gi, ' ')
    .replace(/Please Contact the Sales Office if you require Further Information/gi, ' ')
    .replace(/\[A\]/g, '')
    .replace(/\bUnit or Kilo\b/gi, ' ')
    .replace(/\bPackSize\b/gi, ' ')
    .replace(/\bWeight\b/gi, ' ')
    .replace(/\bPrice\b/gi, ' ')

  return normaliseSpace(next)
}

function splitRepeatedLeadingWord(value: string) {
  return value.replace(/^([A-Z][a-z]+)\1\b/, '$1')
}

function removeKnownFamilyPrefix(value: string) {
  return value
    .replace(/^(Vegetables|Fruits|Dairy|Salads|Herbs Fresh|Herb & Spice Dried|Prepared Produce|Savory Grocery|Savoury Grocery|Washed Salads|Citrus|Root|Brassica|Cucurbits|Mushrooms Wild|Exotic fruit|Baby veg|Cabbage|Capsicum|Potato|Tomato|Onion|Garlic|Artichoke|Asparagus|Beans & Peas|Apples|Berries|Melons)\s*/i, '')
    .trim()
}

function parseWeightToBaseUnits(weight: string | null) {
  if (!weight) return null

  const match = weight
    .replace(/\s+/g, '')
    .match(/^(\d+(?:\.\d+)?)(kg|g|ml|l|ltr|litre|litres)$/i)

  if (!match) return null

  const qty = Number(match[1])
  const unit = match[2].toLowerCase()

  if (!Number.isFinite(qty) || qty <= 0) return null

  if (unit === 'kg') return { amount: qty * 1000, unit: 'g' as const }
  if (unit === 'g') return { amount: qty, unit: 'g' as const }
  if (unit === 'l' || unit === 'ltr' || unit === 'litre' || unit === 'litres') {
    return { amount: qty * 1000, unit: 'ml' as const }
  }
  if (unit === 'ml') return { amount: qty, unit: 'ml' as const }

  return null
}

function canonicalWeight(value: string) {
  const cleaned = value.replace(/\s+/g, '')
  const match = cleaned.match(/^(\d+(?:\.\d+)?)(kg|g|ml|l|ltr|litre|litres)$/i)

  if (!match) return cleaned

  const qty = match[1]
  const unit = match[2].toLowerCase()

  if (unit === 'ltr' || unit === 'litre' || unit === 'litres') {
    return `${qty}l`
  }

  return `${qty}${unit}`
}

function extractPackAndWeight(description: string) {
  let working = normaliseSpace(description)
  let packQuantity: number | null = null
  let packKind: string | null = null
  let weight: string | null = null
  const warnings: string[] = []

  const compoundMatch = working.match(
    /\b(Box|Bag|Pack|Pre-Pack|Tray|Carton|Bottle|Tin|Tub|Jar|Net)\s*x?\s*(\d{1,3})\s*x?\s*(\d{2,5})\s*(g|G|ml|ML)\b/
  )

  if (compoundMatch) {
    packKind = compoundMatch[1]
    packQuantity = Number(compoundMatch[2])
    weight = canonicalWeight(`${compoundMatch[3]}${compoundMatch[4]}`)
    working = normaliseSpace(working.replace(compoundMatch[0], packKind))
  } else {
    const spacedCompoundMatch = working.match(
      /\b(Box|Bag|Pack|Pre-Pack|Tray|Carton|Bottle|Tin|Tub|Jar|Net)\s*x?\s*(\d{1,3})\s+(\d+(?:\.\d+)?)\s*(g|G|kg|KG|ml|ML|l|L|ltr|Ltr|litre|litres)\b/
    )

    if (spacedCompoundMatch) {
      packKind = spacedCompoundMatch[1]
      packQuantity = Number(spacedCompoundMatch[2])
      weight = canonicalWeight(`${spacedCompoundMatch[3]}${spacedCompoundMatch[4]}`)
      working = normaliseSpace(working.replace(spacedCompoundMatch[0], packKind))
    }
  }

  if (!weight) {
    const weightMatches = Array.from(
      working.matchAll(/\b(\d+(?:\.\d+)?)\s*(kg|KG|g|G|ml|ML|l|L|ltr|Ltr|litre|litres)\b/g)
    )

    if (weightMatches.length > 0) {
      const last = weightMatches[weightMatches.length - 1]
      weight = canonicalWeight(`${last[1]}${last[2]}`)
      working = normaliseSpace(working.replace(last[0], ''))
    }
  }

  if (!packQuantity) {
    const explicitXMatch = working.match(
      /\b(Box|Bag|Pack|Pre-Pack|Tray|Carton|Bottle|Tin|Tub|Jar|Net)\s*x\s*(\d{1,4})\b/i
    )

    if (explicitXMatch) {
      packKind = explicitXMatch[1]
      packQuantity = Number(explicitXMatch[2])
      working = normaliseSpace(working.replace(explicitXMatch[0], packKind))
    }
  }

  if (!packQuantity) {
    const eachMatch = working.match(/\b(Box|Unit|Bunch|Pack)\s*(\d{1,4})\s*(Unit|Bunch|Bulbs|Pack|Pcs|Pieces|each)?\b/i)

    if (eachMatch && !/\d+\s*(kg|g|ml|l|ltr|litre|litres)\b/i.test(eachMatch[0])) {
      packKind = eachMatch[1]
      packQuantity = Number(eachMatch[2])
      working = normaliseSpace(working.replace(eachMatch[0], packKind))
    }
  }

  if (!packKind) {
    const kindMatch = working.match(/\b(Box|Bag|Pack|Pre-Pack|Tray|Carton|Bottle|Tin|Tub|Jar|Net|Bunch|Unit|Loose|Retail|Vac Pack)\b/i)
    if (kindMatch) {
      packKind = kindMatch[1]
    }
  }

  let packSize: string | null = null

  if (packKind && packQuantity) {
    packSize = `${packKind} x${packQuantity}`
  } else if (packKind) {
    packSize = packKind
  }

  if (packQuantity && weight) {
    warnings.push(`Interpreted as ${packSize}, ${weight} each.`)
  } else if (packQuantity && !weight) {
    warnings.push(`Interpreted as ${packSize}; no weight found, so costing is per each.`)
  } else if (!packQuantity && weight) {
    warnings.push(`Interpreted as ${weight}; no each quantity found, so costing is per g/ml.`)
  }

  let name = working

  if (packKind) {
    name = name.replace(new RegExp(`\\b${packKind}\\b`, 'i'), ' ')
  }

  name = normaliseSpace(name)

  return {
    name,
    packSize,
    packQuantity,
    weight,
    warnings,
  }
}

function cleanProductName(value: string) {
  let next = stripPdfBoilerplate(value)
  next = splitRepeatedLeadingWord(next)
  next = removeKnownFamilyPrefix(next)

  next = next
    .replace(/\b(Box|Bag|Pack|Pre-Pack|Tray|Carton|Bottle|Tin|Tub|Jar|Net|Bunch|Unit|Loose|Retail|Vac Pack)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  return next
}

function getBaseUnit(weight: string | null, packQuantity: number | null): 'g' | 'ml' | 'each' {
  const parsedWeight = parseWeightToBaseUnits(weight)

  if (parsedWeight?.unit === 'g') return 'g'
  if (parsedWeight?.unit === 'ml') return 'ml'

  if (packQuantity && packQuantity > 0) return 'each'

  return 'each'
}

function calculatePrices({
  packPrice,
  rawUnitPrice,
  weight,
  packQuantity,
}: {
  packPrice: number
  rawUnitPrice: number | null
  weight: string | null
  packQuantity: number | null
}) {
  const parsedWeight = parseWeightToBaseUnits(weight)
  const baseUnit = getBaseUnit(weight, packQuantity)

  let pricePerBaseUnit: number | null = null
  let pricePerSupplierUnit: number | null = null
  let supplierUnitLabel: string | null = null

  if (parsedWeight) {
    if (packQuantity && packQuantity > 0) {
      const totalBaseAmount = parsedWeight.amount * packQuantity

      if (totalBaseAmount > 0) {
        pricePerBaseUnit = round(packPrice / totalBaseAmount)
      }

      pricePerSupplierUnit = rawUnitPrice ?? round(packPrice / packQuantity)
      supplierUnitLabel = 'each'
    } else {
      if (rawUnitPrice !== null) {
        if (parsedWeight.unit === 'g') {
          pricePerBaseUnit = round(rawUnitPrice / 1000)
          supplierUnitLabel = 'kg'
        } else {
          pricePerBaseUnit = round(rawUnitPrice / 1000)
          supplierUnitLabel = 'l'
        }

        pricePerSupplierUnit = rawUnitPrice
      } else if (parsedWeight.amount > 0) {
        pricePerBaseUnit = round(packPrice / parsedWeight.amount)
        supplierUnitLabel = parsedWeight.unit
        pricePerSupplierUnit = packPrice
      }
    }
  } else if (packQuantity && packQuantity > 0) {
    pricePerBaseUnit = rawUnitPrice ?? round(packPrice / packQuantity)
    pricePerSupplierUnit = pricePerBaseUnit
    supplierUnitLabel = 'each'
  } else {
    pricePerBaseUnit = rawUnitPrice ?? packPrice
    pricePerSupplierUnit = pricePerBaseUnit
    supplierUnitLabel = 'supplier unit'
  }

  return {
    baseUnit,
    pricePerBaseUnit,
    pricePerSupplierUnit,
    supplierUnitLabel,
  }
}

function looksLikeGarbageName(name: string) {
  const cleaned = name.toLowerCase().trim()

  if (!cleaned) return true
  if (cleaned.length < 3) return true

  const badExact = new Set([
    'box',
    'boxx',
    'bag',
    'bagx',
    'pack',
    'packx',
    'carton',
    'cartonx',
    'tray',
    'trayx',
    'unit',
    'bunch',
    'net',
  ])

  if (badExact.has(cleaned)) return true

  if (/^(box|bag|pack|carton|tray|unit|bunch|net)x?\d*$/i.test(name)) return true
  if (/product price list|orderproduct code|packsize|buyer at tenjim|caterway/i.test(name)) return true

  return false
}

function parseCandidate(rawCandidate: string): ParsedProduct | null {
  const raw = normaliseSpace(rawCandidate)

  if (!raw.includes('€')) return null

  const rowMatch = raw.match(
    /(.+?)\s+(€\s?\d+(?:\.\d{1,2})?)\s+(€\s?\d+(?:\.\d{1,2})|---)\s+([A-Z0-9.]{2,})\b/i
  )

  if (!rowMatch) return null

  const descriptionRaw = rowMatch[1]
  const packPrice = parseMoney(rowMatch[2])
  const rawUnitPrice = parseMoney(rowMatch[3])
  const supplierSku = String(rowMatch[4] || '').trim()

  if (!supplierSku || !packPrice || packPrice <= 0) return null

  const cleanedDescription = stripPdfBoilerplate(descriptionRaw)
  const extracted = extractPackAndWeight(cleanedDescription)
  const name = cleanProductName(extracted.name)

  if (looksLikeGarbageName(name)) return null

  const pricing = calculatePrices({
    packPrice,
    rawUnitPrice,
    weight: extracted.weight,
    packQuantity: extracted.packQuantity,
  })

  const warnings = [...extracted.warnings]

  if (!extracted.weight && !extracted.packQuantity) {
    warnings.push('No weight or pack quantity found. Costing falls back to supplier unit.')
  }

  return {
    supplier: 'Caterway',
    supplierSku,
    name,
    packSize: extracted.packSize,
    weight: extracted.weight,
    packPrice,
    unitPrice: pricing.pricePerBaseUnit,
    rawUnitPrice,
    baseUnit: pricing.baseUnit,
    pricePerBaseUnit: pricing.pricePerBaseUnit,
    pricePerSupplierUnit: pricing.pricePerSupplierUnit,
    supplierUnitLabel: pricing.supplierUnitLabel,
    warnings,
    raw,
  }
}

function buildCandidates(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => normaliseSpace(line))
    .filter(Boolean)

  const compact = normaliseSpace(text)

  const candidates: string[] = []

  for (const line of lines) {
    if (line.includes('€')) candidates.push(line)
  }

  const regex =
    /[A-Za-z0-9][A-Za-z0-9\s\/\-\.\[\]&'*+()]{2,}?\s+€\s?\d+(?:\.\d{1,2})?\s+(?:€\s?\d+(?:\.\d{1,2})|---)\s+[A-Z0-9.]{2,}\b/g

  const compactMatches = compact.match(regex) ?? []
  candidates.push(...compactMatches)

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

    const candidates = buildCandidates(text)
    const bySku = new Map<string, ParsedProduct>()

    for (const candidate of candidates) {
      const product = parseCandidate(candidate)

      if (!product) continue

      const existing = bySku.get(product.supplierSku)

      if (!existing) {
        bySku.set(product.supplierSku, product)
        continue
      }

      const existingScore =
        (existing.weight ? 1 : 0) +
        (existing.packSize ? 1 : 0) +
        (existing.name.length > 4 ? 1 : 0)

      const nextScore =
        (product.weight ? 1 : 0) +
        (product.packSize ? 1 : 0) +
        (product.name.length > 4 ? 1 : 0)

      if (nextScore >= existingScore && product.raw.length <= existing.raw.length + 80) {
        bySku.set(product.supplierSku, product)
      }
    }

    const products = Array.from(bySku.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    )

    if (products.length === 0) {
      return NextResponse.json(
        {
          error: 'No valid Caterway rows were parsed.',
          debug: {
            textLength: text.length,
            candidateCount: candidates.length,
            sampleCandidates: candidates.slice(0, 20),
          },
        },
        { status: 400 }
      )
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