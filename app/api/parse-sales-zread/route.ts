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

type ParsedModifierRow = {
  sourceCode: string | null
  sourceName: string
  modifierType: 'EXTRA' | 'REMOVE'
  qty: number | null
  notes: string | null
}

type ParsedSalesReport = {
  salesDate: string | null
  rows: ParsedSalesRow[]
  modifierRows?: ParsedModifierRow[]
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

async function matchModifierItem({
  restaurantId,
  sourceCode,
  sourceName,
}: {
  restaurantId: string
  sourceCode: string | null
  sourceName: string
}) {
  const code = cleanText(sourceCode)
  const rawName = cleanText(sourceName) || ''
  const name = rawName
    .replace(/\b(extra|add|added|no|without|remove|removed|minus|less)\b/gi, '')
    .trim()

  if (code) {
    const exactSku = await prisma.item.findFirst({
      where: {
        restaurantId,
        itemType: {
          in: ['L1', 'L2', 'L3'],
        },
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
        matchReason: 'Exact item SKU/code match',
      }
    }
  }

  for (const candidate of [rawName, name].filter(Boolean)) {
    const exactName = await prisma.item.findFirst({
      where: {
        restaurantId,
        itemType: {
          in: ['L1', 'L2', 'L3'],
        },
        name: {
          equals: candidate,
          mode: 'insensitive',
        },
      },
    })

    if (exactName) {
      return {
        item: exactName,
        confidence: 0.9,
        matchReason: 'Exact item name match',
      }
    }

    const looseName = await prisma.item.findFirst({
      where: {
        restaurantId,
        itemType: {
          in: ['L1', 'L2', 'L3'],
        },
        name: {
          contains: candidate,
          mode: 'insensitive',
        },
      },
    })

    if (looseName) {
      return {
        item: looseName,
        confidence: 0.65,
        matchReason: 'Loose item name match',
      }
    }
  }

  return {
    item: null,
    confidence: 0,
    matchReason: code ? 'No matching item SKU/code found' : 'No matching item found',
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()
    const { text } = await textFromAiRequest(req)
    const [l1Items, modifierItems] = await Promise.all([
      prisma.item.findMany({
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
      }),
      prisma.item.findMany({
        where: {
          restaurantId: tenant.restaurantId,
          itemType: {
            in: ['L1', 'L2', 'L3'],
          },
        },
        orderBy: {
          name: 'asc',
        },
        select: {
          sku: true,
          name: true,
          itemType: true,
          unitType: true,
        },
      }),
    ])

    const itemContext = l1Items
      .slice(0, 500)
      .map((item) => `${item.sku}\t${item.name}`)
      .join('\n')
    const modifierContext = modifierItems
      .slice(0, 800)
      .map((item) => `${item.sku}\t${item.name}\t${item.itemType}\t${item.unitType}`)
      .join('\n')

    const prompt = `
You are extracting end-of-night restaurant POS Z-read sales into Flowdish.

Flowdish records sales against L1 dishes only. L1 sales consume BOM inventory.

Return ONLY valid JSON. No markdown. No explanation.

Extract only sold menu item rows. Ignore payment totals, tax/VAT totals, tender summaries, card/cash splits, discounts, delivery address, staff names, table numbers, report headers, and footers.

Also extract modifier/add-on/removal rows into modifierRows, not normal sales rows. Examples:
- Extra cheese, add cheese, extra sauce, extra bacon => modifierType EXTRA.
- No sauce, without sauce, remove onions, no cheese => modifierType REMOVE.
- Modifier rows may be L1, L2, or L3 stock corrections. They must be reviewed by a human before saving.

Fields:
- salesDate: ISO date YYYY-MM-DD if visible, else null.
- sourceCode: POS item code/SKU/PLU/code if visible, else null.
- sourceName: sold item/dish name.
- qty: quantity sold.
- notes: uncertainty or relevant parsing note.

Modifier row fields:
- sourceCode: POS item code/SKU/PLU/code if visible, else null.
- sourceName: modifier/add-on/removal name exactly as shown.
- modifierType: "EXTRA" or "REMOVE".
- qty: modifier quantity/count if visible. If the POS row quantity is count of button presses, use that.
- notes: uncertainty or relevant parsing note.

Rules:
- Columns titled SKU, CODE, ITEM, ITEM CODE, PRODUCT CODE, PLU, PRODUCT, or ID can be sourceCode.
- Columns titled DESCRIPTION, ITEM NAME, PRODUCT NAME, NAME, or MENU ITEM can be sourceName.
- Use quantity sold, not price, net sales, gross sales, VAT, or total cost.
- Do not invent rows.
- If unsure whether a line is a sold menu item, omit it.

Known Flowdish L1 dishes for matching context:
${itemContext}

Known Flowdish items for modifier matching context:
${modifierContext}

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
  ],
  "modifierRows": [
    {
      "sourceCode": string | null,
      "sourceName": string,
      "modifierType": "EXTRA" | "REMOVE",
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
    const modifierRows = Array.isArray(parsed.modifierRows) ? parsed.modifierRows : []
    const matchedRows = []
    const matchedModifierRows = []

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

    for (const row of modifierRows) {
      const sourceName = cleanText(row.sourceName) || ''
      const qty = toNullableNumber(row.qty)
      const modifierType = row.modifierType === 'REMOVE' ? 'REMOVE' : 'EXTRA'

      if (!sourceName) continue

      const match = await matchModifierItem({
        restaurantId: tenant.restaurantId,
        sourceCode: cleanText(row.sourceCode),
        sourceName,
      })

      matchedModifierRows.push({
        sourceCode: cleanText(row.sourceCode),
        sourceName,
        modifierType,
        qty,
        matchedItemId: match.item?.id ?? null,
        matchedItemSku: match.item?.sku ?? null,
        matchedItemName: match.item?.name ?? null,
        matchedItemType: match.item?.itemType ?? null,
        matchedItemUnitType: match.item?.unitType ?? null,
        confidence: match.confidence,
        matchReason: match.matchReason,
        notes: cleanText(row.notes),
        needsReview: !match.item || !qty || qty <= 0 || match.confidence < 0.9,
      })
    }

    return NextResponse.json({
      salesDate: cleanText(parsed.salesDate),
      rows: matchedRows,
      modifierRows: matchedModifierRows,
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
