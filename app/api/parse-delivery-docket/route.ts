export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  aiErrorResponse,
  cleanText,
  documentFromAiRequest,
  parseJsonWithDeepSeek,
} from '@/lib/ai-import'
import { sanitiseDocumentForAi } from '@/lib/document-privacy'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'

type UnitType = 'g' | 'ml' | 'each'

type ExtractedDocketRow = {
  supplierSku: string | null
  productName: string
  packSize: string | null
  packCount: number | null
  qty: number | null
  unitType: UnitType | null
  packPrice: number | null
  lineTotal: number | null
  vatCode: string | null
  vatRatePercent: number | null
  quantityConfidence: number | null
  quantityReason: string | null
  notes: string | null
}

type ExtractedDocket = {
  supplier: string | null
  deliveryDate: string | null
  docketNumber: string | null
  vatLegend: Array<{
    code: string
    ratePercent: number
  }>
  rows: ExtractedDocketRow[]
}

function normaliseSupplier(value: string | null) {
  if (!value) return null
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

function comparableVatCode(value: unknown) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^VAT\s*CODE\s*/i, '')
    .replace(/[^A-Z0-9]/g, '')
}

function validVatRate(value: unknown) {
  const rate = toNullableNumber(value)
  return rate !== null && rate >= 0 && rate <= 100 ? rate : null
}

function validConfidence(value: unknown) {
  const confidence = toNullableNumber(value)
  if (confidence === null || confidence < 0 || confidence > 100) return null
  return confidence <= 1 ? confidence : confidence / 100
}

type SupplierProductMatchCandidate = {
  id: string
  supplier: string
  supplierSku: string | null
  name: string
  packSize: string | null
  weight: string | null
  packPrice: number | null
  unitPrice: number | null
  linkedItemId: string | null
  linkedItem: {
    id: string
    sku: string
    name: string
    unitType: UnitType
  } | null
}

function comparable(value: string | null | undefined) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b(?:case|unit|each|pack|box|bag|tray|tub|tin|bottle|loose|chilled|frozen)\b/g, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:x\s*)?\d*(?:[.,]\d+)?\s*(?:kg|gm?|g|ltr?|litres?|ml)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function comparableSku(value: string | null | undefined) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function supplierMatches(left: string | null, right: string) {
  const first = comparable(left)
  const second = comparable(right)
  return Boolean(first && second && (first === second || first.includes(second) || second.includes(first)))
}

function productNameScore(left: string, right: string) {
  const first = comparable(left)
  const second = comparable(right)

  if (!first || !second) return 0
  if (first === second) return 1
  if (first.length >= 5 && second.length >= 5 && (first.includes(second) || second.includes(first))) {
    return 0.9
  }

  const firstTokens = new Set(first.split(' ').filter((token) => token.length > 1))
  const secondTokens = new Set(second.split(' ').filter((token) => token.length > 1))
  const shared = [...firstTokens].filter((token) => secondTokens.has(token)).length

  if (shared === 0) return 0
  return (2 * shared) / (firstTokens.size + secondTokens.size)
}

function parsePackBaseAmount(...values: Array<string | null | undefined>) {
  const text = values.filter(Boolean).join(' ').toLowerCase().replace(/,/g, '.')
  const unitAmount = (amount: number, unit: string) => {
    if (unit === 'kg') return { amount: amount * 1000, unitType: 'g' as const }
    if (unit === 'g' || unit === 'gm') return { amount, unitType: 'g' as const }
    if (unit === 'l' || unit === 'ltr' || unit === 'litre') {
      return { amount: amount * 1000, unitType: 'ml' as const }
    }
    return { amount, unitType: 'ml' as const }
  }

  const multiPack = text.match(
    /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|gm?|g|ltr?|litre|ml)\b/
  )

  if (multiPack) {
    const count = Number(multiPack[1])
    const size = unitAmount(Number(multiPack[2]), multiPack[3])
    if (Number.isFinite(count) && count > 0 && Number.isFinite(size.amount)) {
      return { amount: count * size.amount, unitType: size.unitType }
    }
  }

  const single = text.match(/(\d+(?:\.\d+)?)\s*(kg|gm?|g|ltr?|litre|ml)\b/)
  if (!single) return null

  const parsed = unitAmount(Number(single[1]), single[2])
  return Number.isFinite(parsed.amount) && parsed.amount > 0 ? parsed : null
}

function normaliseQuantityForMatchedProduct(
  row: ExtractedDocketRow,
  product: SupplierProductMatchCandidate | null
) {
  if (!product?.linkedItem || !row.qty || row.qty <= 0) return row

  const itemUnit = product.linkedItem.unitType
  if (itemUnit === 'each') return { ...row, unitType: 'each' as const }

  const packAmount = parsePackBaseAmount(row.packSize, product.packSize, product.weight, product.name)
  if (!packAmount || packAmount.unitType !== itemUnit) return { ...row, unitType: itemUnit }

  if (row.unitType === itemUnit && row.qty >= packAmount.amount / 10) {
    return { ...row, unitType: itemUnit }
  }

  const packCount = row.packCount && row.packCount > 0 ? row.packCount : null
  const looksLikeUnconvertedPackCount =
    row.unitType === 'each' || (row.qty < packAmount.amount / 10 && row.qty <= 100)

  if (!packCount && !looksLikeUnconvertedPackCount) {
    return { ...row, unitType: itemUnit }
  }

  const quantity = (packCount ?? row.qty) * packAmount.amount
  const note = `Quantity converted from ${packCount ?? row.qty} pack(s) using ${row.packSize || product.packSize || product.weight}.`

  return {
    ...row,
    qty: quantity,
    unitType: itemUnit,
    notes: [row.notes, note].filter(Boolean).join(' '),
  }
}

async function extractDocketWithDeepSeek(
  restaurantId: string,
  input: { text: string | null; imageDataUrl: string | null },
  supplierHint: string | null
) {
  const sourceInstructions = input.imageDataUrl
    ? `Read the attached delivery docket image directly. Black areas are deliberate privacy
redactions. Ignore them and never try to infer the covered information.`
    : `Read the privacy-filtered OCR text below:\n${input.text?.slice(0, 120000) || ''}`

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
- packSize: exact SIZE or PACK SIZE text if visible, such as "1 x 1 KG", else null
- packCount: total number of cases/units/packs delivered if visible, else null
- qty: total delivered quantity in the base unit, not merely the number of packs
- unitType: "g", "ml", or "each"
- packPrice: price per pack/unit if visible, else null
- lineTotal: total line price if visible, else null
- vatCode: the VAT code printed on that line, if visible, else null
- vatRatePercent: a VAT percentage printed directly on that line, if visible, else null
- quantityConfidence: a number from 0 to 1 measuring only how clearly the delivered
  quantity and unit can be read and calculated
- quantityReason: a short reason for the quantity confidence
- notes: anything uncertain or relevant

Also extract the invoice VAT legend or VAT summary, where each VAT code is mapped to
its VAT rate. For example, a footer may have VAT CODE, VAT RATE, TAXABLE GOODS, and VAT
columns. Return the code and rate only; do not confuse taxable-goods or VAT-charge totals
with the rate.

Rules:
- Do not invent rows.
- If uncertain, still include the row but put uncertainty in notes.
- Dockets may be supplied as a redacted image or OCR text from a table with columns like CODE, PRODUCT, DESCRIPTION, CASE, UNIT, PACK SIZE, SIZE, PRICE, WEIGHT, VALUE, or TOTAL COST.
- CODE and PRODUCT CODE columns are supplierSku. Copy every visible code exactly; never omit a clear code merely because it is numeric or unfamiliar.
- DESCRIPTION is productName. PACK SIZE or SIZE is packSize. VALUE or TOTAL COST is lineTotal. PRICE or WSP is normally packPrice, not a base-unit price.
- Do not use the supplier name or random OCR fragments as supplierSku.
- Supplier SKUs may be numeric, alphabetic, or mixed, and are usually short codes near each row, such as 430399, CMS64, CODSP1, IC7801, ICP781, or MUSS02.
- If the docket uses cases, packs, boxes, trays, bags, bottles, tins, bunches, tubs, units, or eaches, use unitType "each" unless a clear gram/ml amount is the delivered quantity.
- Add CASE and UNIT quantities together when both columns exist to obtain packCount; ignore zeros.
- If a row shows weight like kg/g, multiply the pack size by packCount, convert qty to grams, and use unitType "g". Example: packSize "1 x 1 KG" and one UNIT means packCount 1, qty 1000, unitType "g". Example: "6 x 1.25 KG" and two CASES means qty 15000 g.
- If a row shows litres/ml, convert qty to ml where possible and unitType "ml".
- If price is unclear, use null.
- If supplier SKU is unclear, use null.
- Quantity confidence must not consider product identity, supplier, SKU, price, or VAT.
- Use lower quantity confidence when CASE/UNIT counts, pack-size arithmetic, handwriting,
  folds, glare, or column alignment make the delivered quantity uncertain.
- Copy each line's VAT code exactly from the VAT CODE column.
- Do not guess what a VAT code means. Only return a legend mapping when both its code and
  rate are visible in the document.
- Keep product names clean and do not include headers/footers.
- Do not infer or recreate addresses, contact details, account numbers, payment details, staff names, or any information hidden by black redaction boxes.
- If the supplier is not visible in the filtered text, use ${JSON.stringify(supplierHint)}.

Return this shape exactly:
{
  "supplier": string | null,
  "deliveryDate": string | null,
  "docketNumber": string | null,
  "vatLegend": [
    {
      "code": string,
      "ratePercent": number
    }
  ],
  "rows": [
    {
      "supplierSku": string | null,
      "productName": string,
      "packSize": string | null,
      "packCount": number | null,
      "qty": number | null,
      "unitType": "g" | "ml" | "each" | null,
      "packPrice": number | null,
      "lineTotal": number | null,
      "vatCode": string | null,
      "vatRatePercent": number | null,
      "quantityConfidence": number | null,
      "quantityReason": string | null,
      "notes": string | null
    }
  ]
}

${sourceInstructions}
`
  return parseJsonWithDeepSeek<ExtractedDocket>({
    restaurantId,
    feature: 'delivery_docket',
    prompt,
    imageDataUrl: input.imageDataUrl || undefined,
    qualityCheck: (value) =>
      Array.isArray(value.rows) &&
      value.rows.length > 0 &&
      value.rows.some((row) => Boolean(cleanText(row.productName))),
  })
}

async function deliveryDocketInput(req: Request) {
  const { text, imageDataUrl, body } = await documentFromAiRequest(req)

  if (imageDataUrl) {
    return {
      text: null,
      imageDataUrl,
      supplierHint: cleanText(body?.supplierHint),
      removedLineCount: 0,
      tableBoundaryFound: false,
      mode: 'redacted-image',
    } as const
  }

  const sanitised = sanitiseDocumentForAi(text || '', 'delivery')

  if (sanitised.text.length < 30) {
    throw new Error('OCR_TEXT_TOO_SHORT')
  }

  return {
    text: sanitised.text,
    imageDataUrl: null,
    supplierHint: cleanText(body?.supplierHint),
    removedLineCount: sanitised.removedLineCount,
    tableBoundaryFound: sanitised.tableBoundaryFound,
    mode: 'privacy-filtered-text',
  } as const
}

async function matchSupplierProduct(
  row: ExtractedDocketRow,
  supplier: string | null,
  products: SupplierProductMatchCandidate[]
) {
  const sku = cleanText(row.supplierSku)
  const name = cleanText(row.productName)
  const comparableRowSku = comparableSku(sku)
  const supplierProducts = supplier
    ? products.filter((product) => supplierMatches(supplier, product.supplier))
    : []
  const preferredProducts = supplierProducts.length > 0 ? supplierProducts : products
  const exactSkuMatches = comparableRowSku
    ? products.filter((product) => comparableSku(product.supplierSku) === comparableRowSku)
    : []

  if (comparableRowSku && supplierProducts.length > 0) {
    const exact = supplierProducts.find(
      (product) => comparableSku(product.supplierSku) === comparableRowSku
    )

    if (exact) {
      return {
        supplierProduct: exact,
        confidence: 1,
        matchReason: 'Exact SKU + supplier identity match',
        supplierInferredFromSku: false,
      }
    }
  }

  if (comparableRowSku && !supplier && exactSkuMatches.length === 1) {
    return {
      supplierProduct: exactSkuMatches[0],
      confidence: 0.5,
      matchReason: 'Exact SKU match; supplier inferred from saved product',
      supplierInferredFromSku: true,
    }
  }

  if (comparableRowSku && !supplier && exactSkuMatches.length > 1) {
    return {
      supplierProduct: null,
      confidence: 0.5,
      matchReason: 'Exact SKU matches multiple suppliers; enter supplier to confirm',
      supplierInferredFromSku: false,
    }
  }

  if (name) {
    const scored = preferredProducts
      .map((product) => ({ product, score: productNameScore(name, product.name) }))
      .sort((left, right) => right.score - left.score)
    const best = scored[0]

    if (best && best.score >= 0.62) {
      return {
        supplierProduct: best.product,
        confidence: supplierProducts.length > 0 ? 0.5 : 0,
        matchReason:
          supplierProducts.length > 0
            ? 'Supplier matched; L3 suggested by product name, SKU not confirmed'
            : 'L3 suggested by product name; SKU and supplier not confirmed',
        supplierInferredFromSku: false,
      }
    }
  }

  return {
    supplierProduct: null,
    confidence: supplierProducts.length > 0 ? 0.5 : 0,
    matchReason:
      comparableRowSku && supplier
        ? 'Supplier found, but SKU does not match that supplier'
        : supplierProducts.length > 0
          ? 'Supplier matched; SKU is missing or unrecognised'
          : 'SKU and supplier not matched',
    supplierInferredFromSku: false,
  }
}

export async function POST(req: Request) {
  const requestId =
    cleanText(req.headers.get('X-Flowdish-Request-Id')) || crypto.randomUUID()

  try {
    console.info(`[delivery-parser:${requestId}] Request received.`)
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to import delivery dockets.' },
        { status: 403 }
      )
    }

    const docketInput = await deliveryDocketInput(req)
    console.info(
      `[delivery-parser:${requestId}] Input prepared (${docketInput.mode}); starting DeepSeek.`
    )

    const extracted = await extractDocketWithDeepSeek(
      tenant.restaurantId,
      {
        text: docketInput.text,
        imageDataUrl: docketInput.imageDataUrl,
      },
      docketInput.supplierHint
    )
    console.info(
      `[delivery-parser:${requestId}] DeepSeek returned ${Array.isArray(extracted.rows) ? extracted.rows.length : 0} row(s).`
    )

    const supplier = normaliseSupplier(cleanText(extracted.supplier) || docketInput.supplierHint)
    const deliveryDate = cleanText(extracted.deliveryDate)
    const docketNumber = cleanText(extracted.docketNumber)
    const rows = Array.isArray(extracted.rows) ? extracted.rows : []
    const vatRatesByCode = new Map<string, number>()

    for (const entry of Array.isArray(extracted.vatLegend) ? extracted.vatLegend : []) {
      const code = comparableVatCode(entry?.code)
      const rate = validVatRate(entry?.ratePercent)
      if (code && rate !== null) vatRatesByCode.set(code, rate)
    }

    const supplierProducts = (await prisma.supplierProduct.findMany({
      where: { restaurantId: tenant.restaurantId },
      include: { linkedItem: true },
    })) as SupplierProductMatchCandidate[]

    const matchedRows = []

    for (const row of rows) {
      const cleanRow: ExtractedDocketRow = {
        supplierSku: cleanText(row.supplierSku),
        productName: cleanText(row.productName) || '',
        packSize: cleanText(row.packSize),
        packCount: toNullableNumber(row.packCount),
        qty: toNullableNumber(row.qty),
        unitType: normaliseUnitType(row.unitType),
        packPrice: toNullableNumber(row.packPrice),
        lineTotal: toNullableNumber(row.lineTotal),
        vatCode: cleanText(row.vatCode),
        vatRatePercent: validVatRate(row.vatRatePercent),
        quantityConfidence: validConfidence(row.quantityConfidence),
        quantityReason: cleanText(row.quantityReason),
        notes: cleanText(row.notes),
      }

      if (!cleanRow.productName) continue

      const match = await matchSupplierProduct(cleanRow, supplier, supplierProducts)
      const normalisedRow = normaliseQuantityForMatchedProduct(
        cleanRow,
        match.supplierProduct
      )
      const legendVatRate = cleanRow.vatCode
        ? vatRatesByCode.get(comparableVatCode(cleanRow.vatCode))
        : undefined
      const vatRatePercent = cleanRow.vatRatePercent ?? legendVatRate ?? null
      const unresolvedVatCode = Boolean(cleanRow.vatCode && vatRatePercent === null)
      const vatNotes = unresolvedVatCode
        ? `VAT code ${cleanRow.vatCode} was not found in the selected VAT legend.`
        : null
      const quantityConfidence =
        cleanRow.quantityConfidence ??
        (normalisedRow.qty && normalisedRow.unitType ? 0.8 : 0)
      const quantityReason =
        cleanRow.quantityReason ||
        (quantityConfidence > 0 ? 'Quantity and unit were extracted.' : 'Quantity needs review.')
      const matchedSupplier =
        supplier ||
        (match.supplierInferredFromSku ? match.supplierProduct?.supplier ?? null : null)

      matchedRows.push({
        ...normalisedRow,
        vatRatePercent,
        quantityConfidence,
        quantityReason,
        notes: [normalisedRow.notes, vatNotes].filter(Boolean).join(' ') || null,
        supplier: matchedSupplier,
        supplierInferredFromSku: match.supplierInferredFromSku,
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
          !normalisedRow.qty ||
          !normalisedRow.unitType ||
          quantityConfidence < 0.75 ||
          unresolvedVatCode,
      })
    }

    return NextResponse.json(
      {
        supplier,
        deliveryDate,
        docketNumber,
        rows: matchedRows,
        rawExtracted: extracted,
        parser: {
          provider: 'deepseek',
          mode: docketInput.mode,
          model: 'flash-first',
          removedLineCount: docketInput.removedLineCount,
          tableBoundaryFound: docketInput.tableBoundaryFound,
        },
      },
      { headers: { 'X-Flowdish-Request-Id': requestId } }
    )
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) {
      tenantError.headers.set('X-Flowdish-Request-Id', requestId)
      return tenantError
    }

    const aiError = aiErrorResponse(error)
    if (aiError) {
      console.error(`[delivery-parser:${requestId}] AI request failed:`, error)
      aiError.headers.set('X-Flowdish-Request-Id', requestId)
      return aiError
    }

    console.error(`[delivery-parser:${requestId}] Request failed:`, error)
    return NextResponse.json(
      { error: 'Failed to parse delivery docket.' },
      { status: 500, headers: { 'X-Flowdish-Request-Id': requestId } }
    )
  }
}
