export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'

type UnitType = 'g' | 'ml' | 'each'

type ExtractedDocketRow = {
  supplierSku: string | null
  productName: string
  qty: number | null
  unitType: UnitType | null
  packPrice: number | null
  lineTotal: number | null
  notes: string | null
}

type ExtractedDocket = {
  supplier: string | null
  deliveryDate: string | null
  docketNumber: string | null
  rows: ExtractedDocketRow[]
}

function extractJson(text: string) {
  const cleaned = text
    .replace(/^```json/i, '')
    .replace(/^```/i, '')
    .replace(/```$/i, '')
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1))
    }

    throw new Error('DeepSeek response was not valid JSON')
  }
}

function normaliseSupplier(value: string | null) {
  if (!value) return null

  const lower = value.toLowerCase()

  if (lower.includes('sysco')) return 'Sysco'
  if (lower.includes('caterway')) return 'Caterway'

  return value.trim()
}

function normaliseUnitType(value: unknown): UnitType | null {
  if (value !== 'g' && value !== 'ml' && value !== 'each') return null
  return value
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null

  const number = Number(value)

  return Number.isFinite(number) ? number : null
}

function cleanText(value: unknown) {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : null
}

function textFromWorkbook(buffer: Buffer) {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: false,
    raw: false,
  })

  const sheetTexts = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null>>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    })

    const textRows = rows
      .map((row) =>
        row
          .map((cell) => String(cell ?? '').trim())
          .filter(Boolean)
          .join('\t')
      )
      .filter(Boolean)

    return [`Sheet: ${sheetName}`, ...textRows].join('\n')
  })

  return sheetTexts.join('\n\n').trim()
}

async function textFromFile(file: File, buffer: Buffer) {
  const mimeType = file.type || 'application/octet-stream'
  const fileName = file.name || 'delivery-docket'
  const lowerName = fileName.toLowerCase()
  const isPdf = mimeType === 'application/pdf' || lowerName.endsWith('.pdf')
  const isText =
    mimeType.startsWith('text/') ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.csv')
  const isSpreadsheet =
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    mimeType.includes('spreadsheet') ||
    mimeType === 'application/vnd.ms-excel'
  const isImage = mimeType.startsWith('image/')

  if (isImage) {
    throw new Error('OCR_PROVIDER_REQUIRED')
  }

  if (isPdf) {
    const pdf = require('pdf-parse/lib/pdf-parse.js')
    const parsed = await pdf(buffer)
    const text = String(parsed.text || '').trim()

    if (text.length < 30) {
      throw new Error('OCR_PROVIDER_REQUIRED')
    }

    return text
  }

  if (isText) {
    return buffer.toString('utf8').trim()
  }

  if (isSpreadsheet) {
    const text = textFromWorkbook(buffer)

    if (text.length < 30) {
      throw new Error('EMPTY_SPREADSHEET')
    }

    return text
  }

  throw new Error('UNSUPPORTED_FILE')
}

async function extractDocketWithDeepSeek(text: string) {
  const apiKey = process.env.DEEPSEEK_API_KEY

  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY_MISSING')
  }

  const prompt = `
You are extracting structured delivery docket data for a restaurant inventory system.

Return ONLY valid JSON. No markdown. No explanation.

Extract:
- supplier name
- delivery date in ISO format YYYY-MM-DD if visible
- docket number if visible
- line items

For each line item return:
- supplierSku: supplier product code/SKU if visible, else null
- productName: product description
- qty: delivered quantity as a number if visible
- unitType: "g", "ml", or "each"
- packPrice: price per pack/unit if visible, else null
- lineTotal: total line price if visible, else null
- notes: anything uncertain or relevant

Rules:
- Do not invent rows.
- If uncertain, still include the row but put uncertainty in notes.
- If the docket uses cases, packs, boxes, trays, bags, bottles, tins, bunches, tubs, units, or eaches, use unitType "each" unless a clear gram/ml amount is the delivered quantity.
- If a row shows weight like kg/g, convert qty to grams where possible and unitType "g".
- If a row shows litres/ml, convert qty to ml where possible and unitType "ml".
- If price is unclear, use null.
- If supplier SKU is unclear, use null.
- Keep product names clean and do not include headers/footers.

Return this shape exactly:
{
  "supplier": string | null,
  "deliveryDate": string | null,
  "docketNumber": string | null,
  "rows": [
    {
      "supplierSku": string | null,
      "productName": string,
      "qty": number | null,
      "unitType": "g" | "ml" | "each" | null,
      "packPrice": number | null,
      "lineTotal": number | null,
      "notes": string | null
    }
  ]
}

Delivery docket text:
${text.slice(0, 120000)}
`

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-v4-pro',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
      stream: false,
    }),
  })

  const json = await response.json()

  if (!response.ok) {
    console.error('DeepSeek delivery docket parse failed:', json)
    throw new Error('DEEPSEEK_REQUEST_FAILED')
  }

  const outputText = json?.choices?.[0]?.message?.content || ''
  return extractJson(outputText) as ExtractedDocket
}

async function matchSupplierProduct(row: ExtractedDocketRow, supplier: string | null) {
  const sku = cleanText(row.supplierSku)
  const name = cleanText(row.productName)

  if (supplier && sku) {
    const exact = await prisma.supplierProduct.findFirst({
      where: {
        supplier,
        supplierSku: {
          equals: sku,
          mode: 'insensitive',
        },
      },
      include: {
        linkedItem: true,
      },
    })

    if (exact) {
      return {
        supplierProduct: exact,
        confidence: 0.98,
        matchReason: 'Exact supplier SKU match',
      }
    }
  }

  if (sku) {
    const skuMatch = await prisma.supplierProduct.findFirst({
      where: {
        supplierSku: {
          equals: sku,
          mode: 'insensitive',
        },
      },
      include: {
        linkedItem: true,
      },
    })

    if (skuMatch) {
      return {
        supplierProduct: skuMatch,
        confidence: 0.9,
        matchReason: 'SKU match without supplier confirmation',
      }
    }
  }

  if (supplier && name) {
    const nameMatch = await prisma.supplierProduct.findFirst({
      where: {
        supplier,
        name: {
          contains: name,
          mode: 'insensitive',
        },
      },
      include: {
        linkedItem: true,
      },
    })

    if (nameMatch) {
      return {
        supplierProduct: nameMatch,
        confidence: 0.72,
        matchReason: 'Supplier product name match',
      }
    }
  }

  if (name) {
    const looseNameMatch = await prisma.supplierProduct.findFirst({
      where: {
        name: {
          contains: name,
          mode: 'insensitive',
        },
      },
      include: {
        linkedItem: true,
      },
    })

    if (looseNameMatch) {
      return {
        supplierProduct: looseNameMatch,
        confidence: 0.6,
        matchReason: 'Loose product name match',
      }
    }
  }

  return {
    supplierProduct: null,
    confidence: 0,
    matchReason: sku
      ? 'New or unrecognised supplier SKU'
      : 'No supplier SKU or product match found',
  }
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || ''
    let docketText = ''

    if (contentType.includes('application/json')) {
      const body = await req.json()
      docketText = cleanText(body?.ocrText) || ''

      if (docketText.length < 30) {
        throw new Error('OCR_TEXT_TOO_SHORT')
      }
    } else {
      const formData = await req.formData()
      const file = formData.get('file')

      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'No docket file uploaded.' }, { status: 400 })
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      docketText = await textFromFile(file, buffer)
    }

    const extracted = await extractDocketWithDeepSeek(docketText)

    const supplier = normaliseSupplier(cleanText(extracted.supplier))
    const deliveryDate = cleanText(extracted.deliveryDate)
    const docketNumber = cleanText(extracted.docketNumber)
    const rows = Array.isArray(extracted.rows) ? extracted.rows : []

    const matchedRows = []

    for (const row of rows) {
      const cleanRow: ExtractedDocketRow = {
        supplierSku: cleanText(row.supplierSku),
        productName: cleanText(row.productName) || '',
        qty: toNullableNumber(row.qty),
        unitType: normaliseUnitType(row.unitType),
        packPrice: toNullableNumber(row.packPrice),
        lineTotal: toNullableNumber(row.lineTotal),
        notes: cleanText(row.notes),
      }

      if (!cleanRow.productName) continue

      const match = await matchSupplierProduct(cleanRow, supplier)

      matchedRows.push({
        ...cleanRow,
        supplier,
        matchedSupplierProductId: match.supplierProduct?.id ?? null,
        matchedSupplierProductName: match.supplierProduct?.name ?? null,
        matchedItemId: match.supplierProduct?.linkedItemId ?? null,
        matchedItemSku: match.supplierProduct?.linkedItem?.sku ?? null,
        matchedItemName: match.supplierProduct?.linkedItem?.name ?? null,
        matchedItemUnitType: match.supplierProduct?.linkedItem?.unitType ?? null,
        confidence: match.confidence,
        matchReason: match.matchReason,
        needsReview:
          !match.supplierProduct ||
          !match.supplierProduct.linkedItemId ||
          !cleanRow.qty ||
          !cleanRow.unitType,
      })
    }

    return NextResponse.json({
      supplier,
      deliveryDate,
      docketNumber,
      rows: matchedRows,
      rawExtracted: extracted,
      parser: {
        provider: 'deepseek',
        model: 'deepseek-v4-pro',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'DEEPSEEK_API_KEY_MISSING') {
      return NextResponse.json(
        { error: 'DEEPSEEK_API_KEY is not configured.' },
        { status: 500 }
      )
    }

    if (error instanceof Error && error.message === 'OCR_PROVIDER_REQUIRED') {
      return NextResponse.json(
        {
          error:
            'This file needs OCR before DeepSeek can parse it. Use Take Photo for image dockets, or upload a text-based PDF, Excel, TXT, or CSV file.',
        },
        { status: 400 }
      )
    }

    if (error instanceof Error && error.message === 'OCR_TEXT_TOO_SHORT') {
      return NextResponse.json(
        { error: 'OCR did not find enough readable text in this docket.' },
        { status: 400 }
      )
    }

    if (error instanceof Error && error.message === 'UNSUPPORTED_FILE') {
      return NextResponse.json(
        { error: 'Upload a delivery docket PDF, Excel, TXT, CSV, or image.' },
        { status: 400 }
      )
    }

    if (error instanceof Error && error.message === 'EMPTY_SPREADSHEET') {
      return NextResponse.json(
        { error: 'No readable rows were found in this Excel delivery docket.' },
        { status: 400 }
      )
    }

    console.error('POST /api/parse-delivery-docket failed:', error)
    return NextResponse.json(
      { error: 'Failed to parse delivery docket.' },
      { status: 500 }
    )
  }
}
