export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  aiErrorResponse,
  cleanText,
  parseJsonWithDeepSeek,
  textFromAiRequest,
} from '@/lib/ai-import'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'

type ParsedSupplierRow = {
  supplier: string | null
  supplierSku: string | null
  name: string
  packSize: string | null
  weight: string | null
  packPrice: number | null
  unitPrice: number | null
  notes: string | null
}

type ParsedSupplierPriceList = {
  supplier: string | null
  rows: ParsedSupplierRow[]
}

function toMoney(value: unknown) {
  if (value === null || value === undefined || value === '') return null

  const number = Number(String(value).replace('€', '').replace(',', '').trim())
  return Number.isFinite(number) && number >= 0 ? number : null
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()
    const { text, body } = await textFromAiRequest(req)
    const requestedSupplier = cleanText(body?.supplier)

    const prompt = `
You are extracting supplier product price-list rows for Flowdish, a restaurant stock and costing system.

Return ONLY valid JSON. No markdown. No explanation.

Flowdish supplier product columns:
- supplier: supplier name.
- supplierSku: supplier's product code. Headings may be SKU, CODE, ITEM, ITEM CODE, PRODUCT CODE, PRODUCT, PLU, or ID.
- name: supplier product description/name.
- packSize: pack count or supplier pack description, e.g. "Box x10", "6 x 800g", "Case", "Each".
- weight: total pack weight/volume/count when visible, e.g. "4kg", "10 x 250g", "5l", "12 each".
- packPrice: price for the full pack/case/unit as shown by the supplier.
- unitPrice: price per base unit if clearly shown or easy to calculate; otherwise null.
- notes: uncertainty or parsing note.

Rules:
- Extract product price rows only. Ignore addresses, account details, delivery notes, tax/VAT summaries, invoice totals, contact info, headers, and footers.
- Do not invent rows.
- Preserve supplier SKU/code exactly where possible.
- If both case price and split/unit/kilo price are shown, use case/pack price as packPrice and split/unit/kilo price as unitPrice.
- If only one price is shown, use it as packPrice unless the document clearly labels it as unit/kg price.
- Use null for unclear prices rather than guessing.
- If supplier is not visible, use ${JSON.stringify(requestedSupplier)}.

Return this shape exactly:
{
  "supplier": string | null,
  "rows": [
    {
      "supplier": string | null,
      "supplierSku": string | null,
      "name": string,
      "packSize": string | null,
      "weight": string | null,
      "packPrice": number | null,
      "unitPrice": number | null,
      "notes": string | null
    }
  ]
}

Supplier price-list text:
${text.slice(0, 120000)}
`

    const parsed = await parseJsonWithDeepSeek<ParsedSupplierPriceList>({
      restaurantId: tenant.restaurantId,
      feature: 'supplier_price_import',
      prompt,
    })

    const fallbackSupplier = cleanText(parsed.supplier) || requestedSupplier || ''
    const ready = []
    const needsReview = []

    for (const row of Array.isArray(parsed.rows) ? parsed.rows : []) {
      const cleanRow = {
        supplier: cleanText(row.supplier) || fallbackSupplier,
        supplierSku: cleanText(row.supplierSku),
        name: cleanText(row.name) || '',
        packSize: cleanText(row.packSize),
        weight: cleanText(row.weight),
        packPrice: toMoney(row.packPrice),
        unitPrice: toMoney(row.unitPrice),
        raw: cleanText(row.notes) || undefined,
      }

      if (!cleanRow.name) continue

      const reviewReasons = []
      if (!cleanRow.supplier) reviewReasons.push('Missing supplier')
      if (!cleanRow.supplierSku) reviewReasons.push('Missing supplier SKU/code')
      if (cleanRow.packPrice === null && cleanRow.unitPrice === null) {
        reviewReasons.push('No usable price found')
      }

      if (reviewReasons.length > 0) {
        needsReview.push({
          ...cleanRow,
          reason: reviewReasons.join(', '),
        })
      } else {
        ready.push(cleanRow)
      }
    }

    return NextResponse.json({
      ready,
      needsReview,
      rejected: [],
      debug: {
        parsedCount: ready.length + needsReview.length,
      },
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    const aiError = aiErrorResponse(error)
    if (aiError) return aiError

    console.error('POST /api/parse-supplier-price-list failed:', error)
    return NextResponse.json({ error: 'Failed to parse supplier price list.' }, { status: 500 })
  }
}
