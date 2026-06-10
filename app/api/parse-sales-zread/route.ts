export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  aiErrorResponse,
  cleanText,
  parseJsonWithDeepSeek,
  textFromAiRequest,
} from '@/lib/ai-import'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'

type ParsedSalesRow = {
  sourceCode: string | null
  sourceName: string
  qty: number | null
  notes: string | null
}

type ParsedSalesReport = {
  salesDate: string | null
  rows: ParsedSalesRow[]
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null

  const number = Number(String(value).replace(',', '').trim())
  return Number.isFinite(number) ? number : null
}

async function matchL1Item({
  restaurantId,
  sourceCode,
  sourceName,
}: {
  restaurantId: string
  sourceCode: string | null
  sourceName: string
}) {
  const code = cleanText(sourceCode)
  const name = cleanText(sourceName)

  if (code) {
    const exactSku = await prisma.item.findFirst({
      where: {
        restaurantId,
        itemType: 'L1',
        sku: {
          equals: code,
          mode: 'insensitive',
        },
      },
    })

    if (exactSku) {
      return {
        item: exactSku,
        confidence: 0.98,
        matchReason: 'Exact L1 SKU/code match',
      }
    }
  }

  if (name) {
    const exactName = await prisma.item.findFirst({
      where: {
        restaurantId,
        itemType: 'L1',
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
    })

    if (exactName) {
      return {
        item: exactName,
        confidence: 0.9,
        matchReason: 'Exact L1 name match',
      }
    }

    const looseName = await prisma.item.findFirst({
      where: {
        restaurantId,
        itemType: 'L1',
        name: {
          contains: name,
          mode: 'insensitive',
        },
      },
    })

    if (looseName) {
      return {
        item: looseName,
        confidence: 0.65,
        matchReason: 'Loose L1 name match',
      }
    }
  }

  return {
    item: null,
    confidence: 0,
    matchReason: code ? 'No matching L1 SKU/code found' : 'No matching L1 dish found',
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()
    const { text } = await textFromAiRequest(req)
    const l1Items = await prisma.item.findMany({
      where: {
        restaurantId: tenant.restaurantId,
        itemType: 'L1',
      },
      orderBy: {
        name: 'asc',
      },
      select: {
        sku: true,
        name: true,
      },
    })

    const itemContext = l1Items
      .slice(0, 500)
      .map((item) => `${item.sku}\t${item.name}`)
      .join('\n')

    const prompt = `
You are extracting end-of-night restaurant POS Z-read sales into Flowdish.

Flowdish records sales against L1 dishes only. L1 sales consume BOM inventory.

Return ONLY valid JSON. No markdown. No explanation.

Extract only sold menu item rows. Ignore payment totals, tax/VAT totals, tender summaries, card/cash splits, discounts, delivery address, staff names, table numbers, report headers, and footers.

Fields:
- salesDate: ISO date YYYY-MM-DD if visible, else null.
- sourceCode: POS item code/SKU/PLU/code if visible, else null.
- sourceName: sold item/dish name.
- qty: quantity sold.
- notes: uncertainty or relevant parsing note.

Rules:
- Columns titled SKU, CODE, ITEM, ITEM CODE, PRODUCT CODE, PLU, PRODUCT, or ID can be sourceCode.
- Columns titled DESCRIPTION, ITEM NAME, PRODUCT NAME, NAME, or MENU ITEM can be sourceName.
- Use quantity sold, not price, net sales, gross sales, VAT, or total cost.
- Do not invent rows.
- If unsure whether a line is a sold menu item, omit it.

Known Flowdish L1 dishes for matching context:
${itemContext}

Return this shape exactly:
{
  "salesDate": string | null,
  "rows": [
    {
      "sourceCode": string | null,
      "sourceName": string,
      "qty": number | null,
      "notes": string | null
    }
  ]
}

Z-read/POS text:
${text.slice(0, 120000)}
`

    const parsed = await parseJsonWithDeepSeek<ParsedSalesReport>({
      restaurantId: tenant.restaurantId,
      feature: 'sales_zread',
      prompt,
    })

    const rows = Array.isArray(parsed.rows) ? parsed.rows : []
    const matchedRows = []

    for (const row of rows) {
      const sourceName = cleanText(row.sourceName) || ''
      const qty = toNullableNumber(row.qty)

      if (!sourceName) continue

      const match = await matchL1Item({
        restaurantId: tenant.restaurantId,
        sourceCode: cleanText(row.sourceCode),
        sourceName,
      })

      matchedRows.push({
        sourceCode: cleanText(row.sourceCode),
        sourceName,
        qty,
        matchedItemId: match.item?.id ?? null,
        matchedItemSku: match.item?.sku ?? null,
        matchedItemName: match.item?.name ?? null,
        confidence: match.confidence,
        matchReason: match.matchReason,
        notes: cleanText(row.notes),
        needsReview: !match.item || !qty || qty <= 0 || match.confidence < 0.9,
      })
    }

    return NextResponse.json({
      salesDate: cleanText(parsed.salesDate),
      rows: matchedRows,
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    const aiError = aiErrorResponse(error)
    if (aiError) return aiError

    console.error('POST /api/parse-sales-zread failed:', error)
    return NextResponse.json({ error: 'Failed to parse sales Z-read.' }, { status: 500 })
  }
}
