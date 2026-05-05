export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type ParsedRow = {
  supplier: string
  supplierSku: string | null
  name: string
  packSize: string | null
  weight: string | null
  packPrice: number | null
  unitPrice: number | null
  raw?: string
  reason?: string
}

function parseMoney(value: string | undefined | null) {
  if (!value) return null
  if (value.trim() === '---') return null

  const cleaned = value.replace('€', '').replace(',', '').trim()
  const number = Number(cleaned)

  return Number.isFinite(number) ? number : null
}

function moneyRegex() {
  return /€\s?\d+(?:\.\d{1,4})?|---/g
}

function cleanHeaderFooterText(value: string) {
  return value
    .replace(/Caterway E-Mail\s*:\s*orders@caterway\.ie/gi, ' ')
    .replace(/orders@caterway\.ie/gi, ' ')
    .replace(/Tel\s*:\s*0035318728000/gi, ' ')
    .replace(/Product Price List/gi, ' ')
    .replace(/The Buyer at Tenjim Ltd t\/a Magpie Inn as of [^.]+/gi, ' ')
    .replace(/Product Family/gi, ' ')
    .replace(/Product Item Description/gi, ' ')
    .replace(/PackSize/gi, ' ')
    .replace(/Weight/gi, ' ')
    .replace(/Price/gi, ' ')
    .replace(/Unit or Kilo/gi, ' ')
    .replace(/OrderProduct Code/gi, ' ')
    .replace(/A\]\s*Denotes a Product Item that Contains Allergens or is an Allergen/gi, ' ')
    .replace(/Please Contact the Sales Office if you require Further Information/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normaliseName(value: string) {
  return value
    .replace(/\[A\]/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,])/g, '$1')
    .trim()
}

function titleClean(value: string) {
  return value
    .replace(/^(Vegetables|Fruits|Dairy|Herbs Fresh|Herb & Spice Dried|Prepared Produce|Savory Grocery|Frozen|Dried Bulk|Cheese|Eggs|Salads|Lettuce Specialty|Citrus|Root|Brassica|Capsicum|Cucurbits|Exotic|Mushrooms Wild|Chinese veg|Baby veg|Beans & Peas|Stone|Berries|Grapes|Melons|Nut|Apples|Pears|Potato|Onion|Garlic|Herbs|Micro|Fresh Juice|Sea Veg|Prep Veges|Prep Mixes|Washed Salads|Premium Salads|Kit Salads|Salad Bowls|Crunchy Salads)\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractSku(value: string) {
  const match = value.match(/\b[A-Z0-9][A-Z0-9.\-]{2,}\b$/)
  return match ? match[0] : null
}

function stripSku(value: string, sku: string | null) {
  if (!sku) return value.trim()

  return value
    .replace(new RegExp(`\\s*${escapeRegExp(sku)}\\s*$`), '')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function gramsFromWeight(weight: string | null) {
  if (!weight) return null

  const cleaned = weight.toLowerCase().replace(/\s+/g, '')
  const match = cleaned.match(/^(\d+(?:\.\d+)?)(kg|g|ml|l|ltr|litre|litres)$/)

  if (!match) return null

  const amount = Number(match[1])
  const unit = match[2]

  if (!Number.isFinite(amount) || amount <= 0) return null

  if (unit === 'kg') return amount * 1000
  if (unit === 'g') return amount
  if (unit === 'l' || unit === 'ltr' || unit === 'litre' || unit === 'litres') return amount * 1000
  if (unit === 'ml') return amount

  return null
}

function parsePackAndWeight(rawName: string) {
  let name = normaliseName(titleClean(cleanHeaderFooterText(rawName)))
  let packSize: string | null = null
  let weight: string | null = null

  /*
    Caterway PDF often fuses pack count + unit weight:
    - Boxx10250g  => Box x10 / 250g
    - Boxx6200g   => Box x6 / 200g
    - Pre-Packx6200g => Pre-Pack x6 / 200g
    - Boxx121ltr  => Box x12 / 1ltr
    - Boxx44x500g => Box x4 / 4 x 500g
  */

  const packWords = [
    'Pre-Pack',
    'Vac Pack',
    'Retail',
    'Carton',
    'Bottle',
    'Block',
    'Bunch',
    'Loose',
    'Tray',
    'Pack',
    'Bag',
    'Box',
    'Tub',
    'Tin',
    'Jar',
    'Net',
    'Unit',
  ]

  const packWordPattern = packWords
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')

  // Example: Pre-Packx6200g, Boxx10250g, Boxx121ltr, Boxx24400ml
  const fusedPackWeight = name.match(
    new RegExp(`\\b(${packWordPattern})\\s*x\\s*(\\d{1,3})(\\d{2,5}(?:\\.\\d+)?\\s*(?:kg|g|ml|l|ltr|litre|litres))\\b`, 'i')
  )

  if (fusedPackWeight) {
    const full = fusedPackWeight[0]
    const packWord = fusedPackWeight[1]
    const count = fusedPackWeight[2]
    const unitWeight = fusedPackWeight[3]

    packSize = `${packWord} x${count}`
    weight = unitWeight.replace(/\s+/g, '')

    name = name.replace(full, '').trim()
  }

  // Example: Boxx44x500g => Box x4 / 4 x 500g
  if (!packSize || !weight) {
    const doubleX = name.match(
      new RegExp(`\\b(${packWordPattern})\\s*x\\s*(\\d{1,3})\\s*x\\s*(\\d+(?:\\.\\d+)?\\s*(?:kg|g|ml|l|ltr|litre|litres))\\b`, 'i')
    )

    if (doubleX) {
      const full = doubleX[0]
      const packWord = doubleX[1]
      const count = doubleX[2]
      const unitWeight = doubleX[3]

      packSize = `${packWord} x${count}`
      weight = `${count} x ${unitWeight.replace(/\s+/g, '')}`

      name = name.replace(full, '').trim()
    }
  }

  // Example: Box x10 250g, Pre-Pack x6 200g
  if (!packSize || !weight) {
    const spacedPackWeight = name.match(
      new RegExp(`\\b(${packWordPattern})\\s*x\\s*(\\d{1,3})\\s+(\\d+(?:\\.\\d+)?\\s*(?:kg|g|ml|l|ltr|litre|litres))\\b`, 'i')
    )

    if (spacedPackWeight) {
      const full = spacedPackWeight[0]
      const packWord = spacedPackWeight[1]
      const count = spacedPackWeight[2]
      const unitWeight = spacedPackWeight[3]

      packSize = `${packWord} x${count}`
      weight = unitWeight.replace(/\s+/g, '')

      name = name.replace(full, '').trim()
    }
  }

  // Example: Bag5kg, Tub500g, Tin2.5kg, Bottle750ml
  if (!weight) {
    const simplePackWeight = name.match(
      new RegExp(`\\b(${packWordPattern})\\s*(\\d+(?:\\.\\d+)?\\s*(?:kg|g|ml|l|ltr|litre|litres))\\b`, 'i')
    )

    if (simplePackWeight) {
      const full = simplePackWeight[0]
      const packWord = simplePackWeight[1]
      const unitWeight = simplePackWeight[2]

      packSize = packSize ?? packWord
      weight = unitWeight.replace(/\s+/g, '')

      name = name.replace(full, '').trim()
    }
  }

  // Example: Box x12, Boxx12, Unit 40, Box40Unit
  if (!packSize) {
    const countPack = name.match(
      new RegExp(`\\b(${packWordPattern})\\s*x?\\s*(\\d{1,4})\\s*(Bunch|Unit|Pack|Bulbs|each|pcs|pieces)?\\b`, 'i')
    )

    if (countPack) {
      const full = countPack[0]
      const packWord = countPack[1]
      const count = countPack[2]
      const countUnit = countPack[3]

      packSize = `${packWord} x${count}${countUnit ? ` ${countUnit}` : ''}`

      name = name.replace(full, '').trim()
    }
  }

  name = name
    .replace(/\b(Box|Bag|Tub|Tin|Jar|Bottle|Pre-Pack|Pack|Unit|Net|Loose|Bunch|Carton)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  name = titleClean(normaliseName(name))

  if (!name) {
    name = normaliseName(titleClean(cleanHeaderFooterText(rawName)))
  }

  return {
    name,
    packSize,
    weight,
  }
}

function calculateUnitPrice({
  packPrice,
  secondPrice,
  weight,
  packSize,
}: {
  packPrice: number | null
  secondPrice: number | null
  weight: string | null
  packSize: string | null
}) {
  if (!packPrice || packPrice <= 0) return null

  const grams = gramsFromWeight(weight)

  if (grams && grams > 0) {
    return packPrice / grams
  }

  const packText = `${packSize || ''}`.toLowerCase()
  const countMatch = packText.match(/x\s*(\d+)/)
  const count = countMatch ? Number(countMatch[1]) : null

  if (count && count > 0) {
    return packPrice / count
  }

  // Caterway's second price is often €/kg or €/unit.
  // If we cannot infer weight/count, keep it as the best available supplier unit price.
  if (secondPrice && secondPrice > 0) return secondPrice

  return packPrice
}

function makeCandidateRowsFromText(text: string) {
  const compact = text
    .replace(/\r/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const candidates: string[] = []

  /*
    Match:
    product text + pack price + unit/kilo price or --- + SKU
  */
  const rowRegex =
    /(.{4,220}?)\s+(€\s?\d+(?:\.\d{1,4})?)\s+(€\s?\d+(?:\.\d{1,4})?|---)\s+([A-Z0-9][A-Z0-9.\-]{2,})\b/g

  let match: RegExpExecArray | null

  while ((match = rowRegex.exec(compact)) !== null) {
    const rawName = match[1].trim()
    const packPrice = match[2].trim()
    const unitPrice = match[3].trim()
    const sku = match[4].trim()

    candidates.push(`${rawName} ${packPrice} ${unitPrice} ${sku}`)
  }

  return candidates
}

function parseCandidate(raw: string): ParsedRow | null {
  const sku = extractSku(raw)
  if (!sku) return null

  const withoutSku = stripSku(raw, sku)
  const prices = Array.from(withoutSku.matchAll(moneyRegex())).map((match) => match[0])

  const euroPrices = prices.filter((price) => price.includes('€'))

  if (euroPrices.length < 1) return null

  const packPriceRaw = euroPrices[0]
  const secondPriceRaw = prices.length > 1 ? prices[1] : null

  const packPrice = parseMoney(packPriceRaw)
  const secondPrice = parseMoney(secondPriceRaw)

  if (!packPrice || packPrice <= 0) return null

  const beforePrice = withoutSku.split(packPriceRaw)[0]?.trim() || ''

  if (!beforePrice) return null

  const parsed = parsePackAndWeight(beforePrice)

  if (!parsed.name || parsed.name.length < 2) return null

  const unitPrice = calculateUnitPrice({
    packPrice,
    secondPrice,
    weight: parsed.weight,
    packSize: parsed.packSize,
  })

  return {
    supplier: 'Caterway',
    supplierSku: sku,
    name: parsed.name,
    packSize: parsed.packSize,
    weight: parsed.weight,
    packPrice,
    unitPrice,
    raw,
  }
}

function dedupeRows(rows: ParsedRow[]) {
  const map = new Map<string, ParsedRow>()

  for (const row of rows) {
    const key = `${row.supplier}|${row.supplierSku || ''}`

    const existing = map.get(key)

    if (!existing) {
      map.set(key, row)
      continue
    }

    // Prefer cleaner names and rows with weight.
    const existingScore =
      existing.name.length +
      (existing.weight ? 100 : 0) +
      (existing.packSize ? 50 : 0) -
      (existing.name.includes('Product Price List') ? 500 : 0)

    const rowScore =
      row.name.length +
      (row.weight ? 100 : 0) +
      (row.packSize ? 50 : 0) -
      (row.name.includes('Product Price List') ? 500 : 0)

    if (rowScore > existingScore) {
      map.set(key, row)
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const left = a.name.toLowerCase()
    const right = b.name.toLowerCase()
    return left.localeCompare(right)
  })
}

function needsReview(row: ParsedRow) {
  const reasons: string[] = []

  if (!row.supplierSku) reasons.push('Missing supplier SKU')
  if (!row.name || row.name.length < 2) reasons.push('Missing name')
  if (!row.packPrice || row.packPrice <= 0) reasons.push('Missing pack price')

  if (
    row.name.includes('Product Price List') ||
    row.name.includes('OrderProduct Code') ||
    row.name.includes('Further Information') ||
    row.name.includes('Caterway')
  ) {
    reasons.push('Contains PDF header/footer text')
  }

  if (row.name.length > 120) {
    reasons.push('Name is unusually long; possible merged PDF row')
  }

  return reasons
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

    const candidates = makeCandidateRowsFromText(text)

    const parsedRows: ParsedRow[] = []

    for (const candidate of candidates) {
      const row = parseCandidate(candidate)
      if (row) parsedRows.push(row)
    }

    const deduped = dedupeRows(parsedRows)

    const ready: ParsedRow[] = []
    const needsReviewRows: ParsedRow[] = []
    const rejected: ParsedRow[] = []

    for (const row of deduped) {
      const reasons = needsReview(row)

      if (reasons.length === 0) {
        ready.push(row)
      } else {
        needsReviewRows.push({
          ...row,
          reason: reasons.join(', '),
        })
      }
    }

    if (ready.length === 0 && needsReviewRows.length === 0) {
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

    return NextResponse.json({
      ready,
      needsReview: needsReviewRows,
      rejected,
      debug: {
        textLength: text.length,
        candidateCount: candidates.length,
        parsedCount: parsedRows.length,
        dedupedCount: deduped.length,
        readyCount: ready.length,
        needsReviewCount: needsReviewRows.length,
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