export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  aiErrorResponse,
  cleanText,
  parseJsonWithDeepSeek,
  supportedImageMimeType,
  textFromAiRequest,
  textFromUploadFile,
} from '@/lib/ai-import'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'

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

async function extractDocketWithDeepSeek(
  restaurantId: string,
  options: { text?: string; imageDataUrl?: string }
) {
  const inputInstruction = options.imageDataUrl
    ? 'Read the attached delivery docket image directly. Pay close attention to table columns, decimal places, pack quantities, supplier SKUs, and line totals.'
    : `Delivery docket text:\n${String(options.text || '').slice(0, 120000)}`
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
- Many dockets are OCR text from a table with columns like PRODUCT, DESCRIPTION, QTY, WEIGHT, PRICE PER, UNIT COST, TOTAL COST.
- For table OCR, treat the PRODUCT column as supplierSku and DESCRIPTION as productName.
- Do not use the supplier name or random OCR fragments as supplierSku.
- Supplier SKUs are usually short product codes near the start of each row, such as CODSP1, IC7801, ICP781, or MUSS02.
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

${inputInstruction}
`
  return parseJsonWithDeepSeek<ExtractedDocket>({
    restaurantId,
    feature: 'delivery_docket',
    prompt,
    imageDataUrl: options.imageDataUrl,
    qualityCheck: (value) =>
      Array.isArray(value.rows) &&
      value.rows.length > 0 &&
      value.rows.some((row) => Boolean(cleanText(row.productName))),
  })
}

async function deliveryDocketInput(req: Request) {
  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const { text } = await textFromAiRequest(req)
    return { text, imageDataUrl: undefined, inputMode: 'text' as const }
  }

  const formData = await req.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    throw new Error('NO_FILE_UPLOADED')
  }

  const imageMimeType = supportedImageMimeType(file)
  if (imageMimeType) {
    if (file.size > 4 * 1024 * 1024) {
      throw new Error('IMAGE_TOO_LARGE')
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    return {
      text: undefined,
      imageDataUrl: `data:${imageMimeType};base64,${buffer.toString('base64')}`,
      inputMode: 'vision' as const,
    }
  }

  return {
    text: await textFromUploadFile(file),
    imageDataUrl: undefined,
    inputMode: 'text' as const,
  }
}

async function matchSupplierProduct(
  restaurantId: string,
  row: ExtractedDocketRow,
  supplier: string | null
) {
  const sku = cleanText(row.supplierSku)
  const name = cleanText(row.productName)

  if (supplier && sku) {
    const exact = await prisma.supplierProduct.findFirst({
      where: {
        restaurantId,
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
        restaurantId,
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
        restaurantId,
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
        restaurantId,
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
    const tenant = await requireTenant()
    const docketInput = await deliveryDocketInput(req)

    const extracted = await extractDocketWithDeepSeek(tenant.restaurantId, docketInput)

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

      const match = await matchSupplierProduct(tenant.restaurantId, cleanRow, supplier)

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
        mode: docketInput.inputMode,
        model: docketInput.inputMode === 'vision' ? 'deepseek-flash' : 'flash-first',
      },
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    const aiError = aiErrorResponse(error)
    if (aiError) return aiError

    if (error instanceof Error && error.message === 'UNSUPPORTED_IMAGE') {
      return NextResponse.json(
        { error: 'Use a JPEG, PNG, GIF, or WebP docket image.' },
        { status: 400 }
      )
    }

    if (error instanceof Error && error.message === 'IMAGE_TOO_LARGE') {
      return NextResponse.json(
        { error: 'The prepared docket image is too large. Try a smaller photo.' },
        { status: 413 }
      )
    }

    console.error('POST /api/parse-delivery-docket failed:', error)
    return NextResponse.json(
      { error: 'Failed to parse delivery docket.' },
      { status: 500 }
    )
  }
}
