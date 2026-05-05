export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

type RawSyscoRow = {
  'Account selection'?: string
  Item?: string | number
  'Product name'?: string
  Unit?: string
  'Amount in transaction currency'?: string | number
}

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

type GroupedProduct = {
  supplierSku: string
  productName: string
  rows: Array<{
    unit: string
    amount: number
    raw: RawSyscoRow
  }>
}

function parseNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null

  const cleaned = String(value)
    .replace('€', '')
    .replace(',', '')
    .trim()

  const number = Number(cleaned)
  return Number.isFinite(number) ? number : null
}

function normaliseUnit(value: string) {
  const unit = value.trim().toLowerCase()

  if (unit === 'gm') return 'g'
  if (unit === 'g') return 'g'
  if (unit === 'kg') return 'kg'
  if (unit === 'ml') return 'ml'
  if (unit === 'lt') return 'l'
  if (unit === 'ltr') return 'l'
  if (unit === 'litre') return 'l'
  if (unit === 'litres') return 'l'
  if (unit === 'l') return 'l'
  if (unit === 'ea') return 'each'
  if (unit === 'each') return 'each'

  return unit
}

function toBaseAmount(amount: number, unit: string) {
  const normalised = normaliseUnit(unit)

  if (normalised === 'kg') return { amount: amount * 1000, unitType: 'g' as const }
  if (normalised === 'g') return { amount, unitType: 'g' as const }
  if (normalised === 'l') return { amount: amount * 1000, unitType: 'ml' as const }
  if (normalised === 'ml') return { amount, unitType: 'ml' as const }
  if (normalised === 'each') return { amount, unitType: 'each' as const }

  return null
}

function formatBaseAmount(amount: number, unitType: 'g' | 'ml' | 'each') {
  if (unitType === 'each') {
    return `${amount} each`
  }

  if (unitType === 'g' && amount >= 1000 && amount % 1000 === 0) {
    return `${amount / 1000}kg`
  }

  if (unitType === 'ml' && amount >= 1000 && amount % 1000 === 0) {
    return `${amount / 1000}l`
  }

  return `${amount}${unitType}`
}

function cleanName(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,])/g, '$1')
    .trim()
}

function parsePackSpec(productName: string) {
  const name = cleanName(productName)

  /*
    Examples:
    6x800 GM
    1x400 ML
    24x125 GM
    10x1.5 KG
    48x2 EA
    12x1l
    1x4.5-7.5 KG
  */

  const matches = Array.from(
    name.matchAll(
      /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)\s*(kg|gm|g|ml|lt|ltr|l|ea|each)\b/gi
    )
  )

  if (matches.length === 0) {
    return {
      cleanProductName: name,
      packSize: null,
      weight: null,
      count: null,
      singleBaseAmount: null as number | null,
      totalBaseAmount: null as number | null,
      unitType: null as 'g' | 'ml' | 'each' | null,
    }
  }

  // Use the final pack pattern, because some product names contain yield text earlier.
  // Example: Knorr Chicken Bouillon Paste (2x40 LT) 1x880 GM
  const match = matches[matches.length - 1]

  const fullMatch = match[0]
  const count = Number(match[1])
  const sizeRaw = match[2].replace(/\s+/g, '')
  const unitRaw = match[3]

  let size: number

  if (sizeRaw.includes('-')) {
    const parts = sizeRaw.split('-').map((part) => Number(part))
    const validParts = parts.filter((part) => Number.isFinite(part) && part > 0)

    // Use average for variable-weight ranges.
    size =
      validParts.length > 0
        ? validParts.reduce((sum, part) => sum + part, 0) / validParts.length
        : 0
  } else {
    size = Number(sizeRaw)
  }

  const converted = toBaseAmount(size, unitRaw)

  if (!Number.isFinite(count) || count <= 0 || !converted) {
    return {
      cleanProductName: name,
      packSize: null,
      weight: null,
      count: null,
      singleBaseAmount: null,
      totalBaseAmount: null,
      unitType: null,
    }
  }

  const totalBaseAmount = count * converted.amount
  const packSize = `${count} x ${sizeRaw}${normaliseUnit(unitRaw)}`
  const weight = formatBaseAmount(totalBaseAmount, converted.unitType)

  const cleanProductName = cleanName(name.replace(fullMatch, ''))

  return {
    cleanProductName: cleanProductName || name,
    packSize,
    weight,
    count,
    singleBaseAmount: converted.amount,
    totalBaseAmount,
    unitType: converted.unitType,
  }
}

function makeUnitPrice({
  productName,
  csPrice,
  splitPrice,
  kgPrice,
}: {
  productName: string
  csPrice: number | null
  splitPrice: number | null
  kgPrice: number | null
}) {
  const pack = parsePackSpec(productName)

  if (kgPrice !== null && kgPrice > 0) {
    return kgPrice / 1000
  }

  if (splitPrice !== null && splitPrice > 0 && pack.singleBaseAmount && pack.singleBaseAmount > 0) {
    return splitPrice / pack.singleBaseAmount
  }

  if (csPrice !== null && csPrice > 0 && pack.totalBaseAmount && pack.totalBaseAmount > 0) {
    return csPrice / pack.totalBaseAmount
  }

  if (splitPrice !== null && splitPrice > 0) {
    return splitPrice
  }

  if (csPrice !== null && csPrice > 0) {
    return csPrice
  }

  return null
}

function needsReview(row: ParsedRow) {
  const reasons: string[] = []

  if (!row.supplierSku) reasons.push('Missing supplier SKU')
  if (!row.name || row.name.length < 2) reasons.push('Missing name')
  if (!row.packPrice || row.packPrice <= 0) reasons.push('Missing price')

  if (!row.packSize && !row.weight) {
    reasons.push('No pack size or weight found in product name')
  }

  return reasons
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: false,
      raw: false,
    })

    const firstSheetName = workbook.SheetNames[0]

    if (!firstSheetName) {
      return NextResponse.json({ error: 'No sheets found in Excel file' }, { status: 400 })
    }

    const sheet = workbook.Sheets[firstSheetName]

    const rows = XLSX.utils.sheet_to_json<RawSyscoRow>(sheet, {
      defval: '',
      raw: false,
    })

    const groups = new Map<string, GroupedProduct>()

    for (const row of rows) {
      const sku = String(row.Item || '').trim()
      const productName = cleanName(String(row['Product name'] || ''))
      const unit = String(row.Unit || '').trim()
      const amount = parseNumber(row['Amount in transaction currency'])

      if (!sku || !productName || !unit || amount === null || amount <= 0) {
        continue
      }

      const key = sku

      const existing = groups.get(key)

      if (!existing) {
        groups.set(key, {
          supplierSku: sku,
          productName,
          rows: [{ unit, amount, raw: row }],
        })
      } else {
        existing.rows.push({ unit, amount, raw: row })

        // Prefer the longer/more descriptive product name if duplicates differ.
        if (productName.length > existing.productName.length) {
          existing.productName = productName
        }
      }
    }

    const parsedRows: ParsedRow[] = []

    for (const group of groups.values()) {
      const csRow = group.rows.find((row) => row.unit.toLowerCase() === 'cs')
      const splitRow = group.rows.find((row) => row.unit.toLowerCase() === 's')
      const kgRow = group.rows.find((row) => row.unit.toLowerCase() === 'kg')

      const csPrice = csRow?.amount ?? null
      const splitPrice = splitRow?.amount ?? null
      const kgPrice = kgRow?.amount ?? null

      const pack = parsePackSpec(group.productName)

      const packPrice = csPrice ?? splitPrice ?? kgPrice ?? null

      const unitPrice = makeUnitPrice({
        productName: group.productName,
        csPrice,
        splitPrice,
        kgPrice,
      })

      parsedRows.push({
        supplier: 'Sysco',
        supplierSku: group.supplierSku,
        name: pack.cleanProductName,
        packSize: pack.packSize,
        weight: pack.weight,
        packPrice,
        unitPrice,
        raw: JSON.stringify(group.rows.map((row) => row.raw)),
      })
    }

    const ready: ParsedRow[] = []
    const needsReviewRows: ParsedRow[] = []
    const rejected: ParsedRow[] = []

    for (const row of parsedRows.sort((a, b) => a.name.localeCompare(b.name))) {
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

    return NextResponse.json({
      ready,
      needsReview: needsReviewRows,
      rejected,
      debug: {
        sheetName: firstSheetName,
        sourceRows: rows.length,
        groupedProducts: groups.size,
        readyCount: ready.length,
        needsReviewCount: needsReviewRows.length,
      },
    })
  } catch (error) {
    console.error('POST /api/parse-sysco failed:', error)

    return NextResponse.json(
      { error: 'Failed to parse Sysco Excel price file' },
      { status: 500 }
    )
  }
}