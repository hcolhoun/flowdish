export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  aiErrorResponse,
  cleanText,
  documentFromAiRequest,
  parseJsonWithOpenAI,
} from '@/lib/ai-import'
import { sanitiseDocumentForAi } from '@/lib/document-privacy'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'

type UnitType = 'g' | 'ml' | 'each'
type DocketLineType =
  | 'product'
  | 'unavailable'
  | 'charged_not_received'
  | 'deposit'
  | 'delivery_fee'
  | 'discount'
  | 'credit'
  | 'other_charge'

type ExtractedDocketRow = {
  supplierSku: string | null
  productName: string
  lineType: DocketLineType
  packSize: string | null
  packCount: number | null
  caseCount: number | null
  unitCount: number | null
  deliveredWeight: number | null
  deliveredWeightUnit: 'kg' | 'g' | null
  pricingBasis: 'kg' | 'g' | 'ml' | 'each' | 'pack' | null
  qty: number | null
  unitType: UnitType | null
  packPrice: number | null
  lineTotal: number | null
  lineTotalIncludesVat: boolean | null
  batchCode: string | null
  expiryDate: string | null
  vatCode: string | null
  vatRatePercent: number | null
  lineVatAmount: number | null
  skuConfidence: number | null
  skuReason: string | null
  quantityConfidence: number | null
  quantityReason: string | null
  notes: string | null
}

type ExtractedDocket = {
  supplier: string | null
  deliveryDate: string | null
  docketNumber: string | null
  goodsTotal: number | null
  vatTotal: number | null
  grandTotal: number | null
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

function normaliseLineType(value: unknown): DocketLineType {
  const allowed: DocketLineType[] = [
    'product',
    'unavailable',
    'charged_not_received',
    'deposit',
    'delivery_fee',
    'discount',
    'credit',
    'other_charge',
  ]

  return allowed.includes(value as DocketLineType) ? (value as DocketLineType) : 'product'
}

function normaliseWeightUnit(value: unknown) {
  return value === 'kg' || value === 'g' ? value : null
}

function normalisePricingBasis(value: unknown) {
  return ['kg', 'g', 'ml', 'each', 'pack'].includes(String(value || ''))
    ? (value as 'kg' | 'g' | 'ml' | 'each' | 'pack')
    : null
}

function normaliseIsoDate(value: unknown) {
  const date = cleanText(value)
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null

  const parsed = new Date(`${date}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : date
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

function parsePackDefinition(...values: Array<string | null | undefined>) {
  const text = values.filter(Boolean).join(' ').toLowerCase().replace(/,/g, '.')
  const amount = (value: number, unit: string) => {
    if (unit === 'kg') return { amount: value * 1000, unitType: 'g' as const }
    if (unit === 'g' || unit === 'gm') return { amount: value, unitType: 'g' as const }
    if (unit === 'l' || unit === 'ltr' || unit === 'litre') {
      return { amount: value * 1000, unitType: 'ml' as const }
    }
    if (unit === 'ml') return { amount: value, unitType: 'ml' as const }
    return { amount: value, unitType: 'each' as const }
  }
  const multi = text.match(
    /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|gm?|g|ltr?|litre|ml|ea|each)\b/
  )

  if (multi) {
    const unitsPerCase = Number(multi[1])
    const perUnit = amount(Number(multi[2]), multi[3])
    if (Number.isFinite(unitsPerCase) && unitsPerCase > 0 && perUnit.amount > 0) {
      return { unitsPerCase, ...perUnit }
    }
  }

  const single = text.match(/(\d+(?:\.\d+)?)\s*(kg|gm?|g|ltr?|litre|ml|ea|each)\b/)
  if (!single) return null

  return { unitsPerCase: 1, ...amount(Number(single[1]), single[2]) }
}

function normaliseQuantityForMatchedProduct(
  row: ExtractedDocketRow,
  product: SupplierProductMatchCandidate | null
) {
  if (
    row.deliveredWeight &&
    row.deliveredWeight > 0 &&
    row.deliveredWeightUnit
  ) {
    const quantity =
      row.deliveredWeightUnit === 'kg' ? row.deliveredWeight * 1000 : row.deliveredWeight
    const note = `Quantity taken from the docket weight column (${row.deliveredWeight} ${row.deliveredWeightUnit}).`

    return {
      ...row,
      qty: quantity,
      unitType: 'g' as const,
      notes: [row.notes, note].filter(Boolean).join(' '),
    }
  }

  const packDefinition = parsePackDefinition(
    row.packSize,
    product?.packSize,
    product?.weight,
    product?.name
  )
  if (
    packDefinition &&
    ((row.caseCount !== null && row.caseCount >= 0) ||
      (row.unitCount !== null && row.unitCount >= 0))
  ) {
    const cases = row.caseCount ?? 0
    const looseUnits = row.unitCount ?? 0
    const quantity =
      cases * packDefinition.unitsPerCase * packDefinition.amount +
      looseUnits * packDefinition.amount

    if (quantity > 0) {
      const note = `Quantity calculated from ${cases} case(s) and ${looseUnits} loose unit(s) using ${row.packSize || product?.packSize || product?.weight}.`
      return {
        ...row,
        qty: quantity,
        unitType: packDefinition.unitType,
        notes: [row.notes, note].filter(Boolean).join(' '),
      }
    }
  }

  if (
    row.qty &&
    row.qty > 0 &&
    row.unitType === 'g' &&
    /^\s*kg\s*$/i.test(row.packSize || '') &&
    row.qty < 1000
  ) {
    return {
      ...row,
      qty: row.qty * 1000,
      notes: [row.notes, `Quantity converted from ${row.qty} kg.`].filter(Boolean).join(' '),
    }
  }

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

async function extractDocketWithOpenAI(
  restaurantId: string,
  input: { text: string | null; imageDataUrls: string[] },
  supplierHint: string | null
) {
  const sourceInstructions = input.imageDataUrls.length
    ? `Read the attached delivery docket image${input.imageDataUrls.length > 1 ? 's as pages of one docket' : ''} directly. Black areas are deliberate privacy
redactions. Ignore them and never try to infer the covered information. Do not duplicate
rows that continue across pages.`
    : `Read the privacy-filtered OCR text below:\n${input.text?.slice(0, 120000) || ''}`

  const prompt = `
You are extracting structured delivery docket data for a restaurant inventory system.

Return ONLY valid JSON. No markdown. No explanation.

Extract:
- supplier name
- delivery date in ISO format YYYY-MM-DD if visible
- docket number if visible
- goods subtotal before VAT if visible
- total VAT charge if visible
- grand total payable if visible
- line items

For each line item return:
- supplierSku: supplier product code/SKU if visible, else null
- productName: product description
- lineType: "product", "unavailable", "charged_not_received", "deposit",
  "delivery_fee", "discount", "credit", or "other_charge"
- packSize: exact SIZE or PACK SIZE text if visible, such as "1 x 1 KG", else null
- packCount: total packs when only one pack-quantity column exists, else null
- caseCount: number in a CASE or CASES column, else null
- unitCount: number in a UNIT or UNITS column, else null
- deliveredWeight: the numeric value from a separate WEIGHT column, else null
- deliveredWeightUnit: "kg" or "g" for deliveredWeight, else null
- pricingBasis: "kg", "g", "ml", "each", or "pack" when the price basis is visible
- qty: total delivered quantity in the base unit, not merely the number of packs
- unitType: "g", "ml", or "each"
- packPrice: price per pack/unit if visible, else null
- lineTotal: total line price if visible, else null
- lineTotalIncludesVat: false when line values are before VAT and a footer adds VAT, true
  only when the document explicitly says prices include VAT, otherwise null
- batchCode: batch or lot number only when explicitly labelled Batch, Batch ID, or Lot, else null
- expiryDate: best-before, use-by, or expiry date in YYYY-MM-DD if visible, else null
- vatCode: the VAT code printed on that line, if visible, else null
- vatRatePercent: a VAT percentage printed directly on that line, if visible, else null
- lineVatAmount: a monetary VAT amount printed on that line, else null
- skuConfidence: a number from 0 to 1 measuring whether the full SKU is visible and readable
- skuReason: a short reason, especially when an edge or first characters appear cropped
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
- Classify ordinary delivered stock as product.
- Classify a clearly unavailable or cancelled item with no charge as unavailable. Keep the
  row for review, but do not treat it as delivered stock.
- Classify a clearly charged item annotated as missing or not received as charged_not_received.
- Classify returnable-container deposits, delivery charges, discounts, credits, and other
  non-stock invoice lines with the appropriate non-product lineType.
- Do not turn handwritten comments, signatures, totals, headers, or footers into product rows.
- Dockets may be supplied as a redacted image or OCR text from a table with columns like CODE, PRODUCT, DESCRIPTION, CASE, UNIT, PACK SIZE, SIZE, PRICE, WEIGHT, VALUE, or TOTAL COST.
- CODE and PRODUCT CODE columns are supplierSku. Copy every visible code exactly; never omit a clear code merely because it is numeric or unfamiliar.
- BATCH, BATCH ID, LOT, and traceability numbers are batchCode, never supplierSku.
- DESCRIPTION is productName. PACK SIZE or SIZE is packSize. VALUE or TOTAL COST is lineTotal. PRICE or WSP is normally packPrice, not a base-unit price.
- Do not use the supplier name or random OCR fragments as supplierSku.
- Supplier SKUs may be numeric, alphabetic, or mixed, and are usually short codes near each row, such as 430399, CMS64, CODSP1, IC7801, ICP781, or MUSS02.
- If the docket uses cases, packs, boxes, trays, bags, bottles, tins, bunches, tubs, units, or eaches, use unitType "each" unless a clear gram/ml amount is the delivered quantity.
- Preserve CASE and UNIT as separate counts. Never simply add them as equivalent quantities.
  For a 6 x 1 KG pack, one CASE and two UNIT means 8000 g: one full six-unit case plus
  two loose 1 KG units.
- When a separate WEIGHT column contains a non-zero weight, that is the delivered quantity
  for weight-based meat, fish, or produce. Return it as deliveredWeight and also convert qty
  to grams. Do not multiply that weight by the QTY or case count again.
- When SIZE is simply KG and the quantity is 11.500, interpret it as 11.500 kg and return
  qty 11500 with unitType "g".
- If a row shows weight like kg/g, multiply the pack size by packCount, convert qty to grams, and use unitType "g". Example: packSize "1 x 1 KG" and one UNIT means packCount 1, qty 1000, unitType "g". Example: "6 x 1.25 KG" and two CASES means qty 15000 g.
- If a row shows litres/ml, convert qty to ml where possible and unitType "ml".
- If price is unclear, use null.
- If supplier SKU is unclear, use null.
- Never invent missing SKU characters. Use low skuConfidence when the code is cut off by the
  photo edge, fold, glare, or selection boundary.
- Quantity confidence must not consider product identity, supplier, SKU, price, or VAT.
- Use lower quantity confidence when CASE/UNIT counts, pack-size arithmetic, handwriting,
  folds, glare, or column alignment make the delivered quantity uncertain.
- Copy each line's VAT code exactly from the VAT CODE column.
- A VAT column containing money such as 0.00 or 2.68 is lineVatAmount, not vatCode and not
  vatRatePercent. Never return a monetary VAT amount as a VAT code.
- When GOODS TOTAL plus VAT equals AMOUNT PAYABLE, the product VALUE or line total is before
  VAT, so lineTotalIncludesVat is false.
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
  "goodsTotal": number | null,
  "vatTotal": number | null,
  "grandTotal": number | null,
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
      "lineType": "product" | "unavailable" | "charged_not_received" | "deposit" | "delivery_fee" | "discount" | "credit" | "other_charge",
      "packSize": string | null,
      "packCount": number | null,
      "caseCount": number | null,
      "unitCount": number | null,
      "deliveredWeight": number | null,
      "deliveredWeightUnit": "kg" | "g" | null,
      "pricingBasis": "kg" | "g" | "ml" | "each" | "pack" | null,
      "qty": number | null,
      "unitType": "g" | "ml" | "each" | null,
      "packPrice": number | null,
      "lineTotal": number | null,
      "lineTotalIncludesVat": boolean | null,
      "batchCode": string | null,
      "expiryDate": string | null,
      "vatCode": string | null,
      "vatRatePercent": number | null,
      "lineVatAmount": number | null,
      "skuConfidence": number | null,
      "skuReason": string | null,
      "quantityConfidence": number | null,
      "quantityReason": string | null,
      "notes": string | null
    }
  ]
}

${sourceInstructions}
`
  return parseJsonWithOpenAI<ExtractedDocket>({
    restaurantId,
    feature: 'delivery_docket',
    prompt,
    imageDataUrls: input.imageDataUrls.length ? input.imageDataUrls : undefined,
    qualityCheck: (value) =>
      Array.isArray(value.rows) &&
      value.rows.length > 0 &&
      value.rows.some((row) => Boolean(cleanText(row.productName))),
  })
}

async function deliveryDocketInput(req: Request) {
  const { text, imageDataUrl, imageDataUrls, body } = await documentFromAiRequest(req)
  const images = imageDataUrls?.length
    ? imageDataUrls
    : imageDataUrl
      ? [imageDataUrl]
      : []

  if (images.length) {
    return {
      text: null,
      imageDataUrls: images,
      supplierHint: cleanText(body?.supplierHint),
      removedLineCount: 0,
      tableBoundaryFound: false,
      mode: images.length > 1 ? 'redacted-images' : 'redacted-image',
    } as const
  }

  const sanitised = sanitiseDocumentForAi(text || '', 'delivery')

  if (sanitised.text.length < 30) {
    throw new Error('OCR_TEXT_TOO_SHORT')
  }

  return {
    text: sanitised.text,
    imageDataUrls: [] as string[],
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
      `[delivery-parser:${requestId}] Input prepared (${docketInput.mode}); starting OpenAI.`
    )

    const extracted = await extractDocketWithOpenAI(
      tenant.restaurantId,
      {
        text: docketInput.text,
        imageDataUrls: docketInput.imageDataUrls,
      },
      docketInput.supplierHint
    )
    console.info(
      `[delivery-parser:${requestId}] OpenAI returned ${Array.isArray(extracted.rows) ? extracted.rows.length : 0} row(s).`
    )

    const supplier = normaliseSupplier(cleanText(extracted.supplier) || docketInput.supplierHint)
    const deliveryDate = cleanText(extracted.deliveryDate)
    const docketNumber = cleanText(extracted.docketNumber)
    const goodsTotal = toNullableNumber(extracted.goodsTotal)
    const vatTotal = toNullableNumber(extracted.vatTotal)
    const grandTotal = toNullableNumber(extracted.grandTotal)
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
        lineType: normaliseLineType(row.lineType),
        packSize: cleanText(row.packSize),
        packCount: toNullableNumber(row.packCount),
        caseCount: toNullableNumber(row.caseCount),
        unitCount: toNullableNumber(row.unitCount),
        deliveredWeight: toNullableNumber(row.deliveredWeight),
        deliveredWeightUnit: normaliseWeightUnit(row.deliveredWeightUnit),
        pricingBasis: normalisePricingBasis(row.pricingBasis),
        qty: toNullableNumber(row.qty),
        unitType: normaliseUnitType(row.unitType),
        packPrice: toNullableNumber(row.packPrice),
        lineTotal: toNullableNumber(row.lineTotal),
        lineTotalIncludesVat:
          typeof row.lineTotalIncludesVat === 'boolean' ? row.lineTotalIncludesVat : null,
        batchCode: cleanText(row.batchCode),
        expiryDate: normaliseIsoDate(row.expiryDate),
        vatCode: cleanText(row.vatCode),
        vatRatePercent: validVatRate(row.vatRatePercent),
        lineVatAmount: toNullableNumber(row.lineVatAmount),
        skuConfidence: validConfidence(row.skuConfidence),
        skuReason: cleanText(row.skuReason),
        quantityConfidence: validConfidence(row.quantityConfidence),
        quantityReason: cleanText(row.quantityReason),
        notes: cleanText(row.notes),
      }

      if (!cleanRow.productName) continue

      const match =
        cleanRow.lineType === 'product'
          ? await matchSupplierProduct(cleanRow, supplier, supplierProducts)
          : {
              supplierProduct: null,
              confidence: 0,
              matchReason: 'Non-stock invoice line',
              supplierInferredFromSku: false,
            }
      const normalisedRow = normaliseQuantityForMatchedProduct(
        cleanRow,
        match.supplierProduct
      )
      const legendVatRate = cleanRow.vatCode
        ? vatRatesByCode.get(comparableVatCode(cleanRow.vatCode))
        : undefined
      const vatRatePercent =
        cleanRow.vatRatePercent ??
        legendVatRate ??
        (!cleanRow.vatCode && cleanRow.lineVatAmount === 0 ? 0 : null)
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
          cleanRow.lineType === 'product' &&
          (!match.supplierProduct ||
            !match.supplierProduct.linkedItemId ||
            !normalisedRow.qty ||
            !normalisedRow.unitType ||
            (normalisedRow.supplierSku &&
              (normalisedRow.skuConfidence ?? 0.8) < 0.75) ||
            quantityConfidence < 0.75 ||
            unresolvedVatCode),
      })
    }

    const reconcilableRows = matchedRows.filter((row) => row.lineType !== 'unavailable')
    const pricedRows = reconcilableRows.filter((row) => row.lineTotal !== null)
    const lineTotalSum = Math.round(
      pricedRows.reduce((sum, row) => sum + Number(row.lineTotal || 0), 0) * 100
    ) / 100
    const totalsDifference =
      goodsTotal === null ? null : Math.round((goodsTotal - lineTotalSum) * 100) / 100
    const totalsTolerance =
      goodsTotal === null ? null : Math.max(0.05, Math.abs(goodsTotal) * 0.002)
    const totalsMatch =
      totalsDifference === null || totalsTolerance === null
        ? null
        : pricedRows.length === reconcilableRows.length &&
          Math.abs(totalsDifference) <= totalsTolerance

    return NextResponse.json(
      {
        supplier,
        deliveryDate,
        docketNumber,
        totals: {
          goodsTotal,
          vatTotal,
          grandTotal,
          extractedLineTotal: lineTotalSum,
          difference: totalsDifference,
          matches: totalsMatch,
          pricedRowCount: pricedRows.length,
          rowCount: matchedRows.length,
        },
        rows: matchedRows,
        rawExtracted: extracted,
        parser: {
          provider: 'openai',
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
