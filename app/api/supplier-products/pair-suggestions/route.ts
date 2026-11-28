import { NextResponse } from 'next/server'
import { aiErrorResponse, parseJsonWithOpenAI } from '@/lib/ai-import'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'

export const maxDuration = 90

type UnitType = 'g' | 'ml' | 'each'

type PairingAiResponse = {
  matches?: Array<{
    itemId?: string
    productId?: string | null
    confidence?: number
    reason?: string
  }>
}

type PairInput = {
  itemId: string
  productId: string
}

type Candidate = {
  productId: string
  supplier: string
  supplierSku: string | null
  name: string
  packSize: string | null
  weight: string | null
  unitPrice: number | null
  unitType: UnitType
  currentL3: string | null
  score: number
}

const ignoredTokens = new Set([
  'and',
  'bag',
  'box',
  'case',
  'catering',
  'chilled',
  'each',
  'fresh',
  'frozen',
  'gram',
  'grams',
  'kg',
  'kilo',
  'large',
  'litre',
  'litres',
  'ltr',
  'medium',
  'ml',
  'pack',
  'packet',
  'prepared',
  'small',
  'the',
  'unit',
])

function singularToken(token: string) {
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`
  if (token.endsWith('oes') && token.length > 4) return token.slice(0, -2)
  if (token.endsWith('ses') && token.length > 4) return token.slice(0, -2)
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 3) return token.slice(0, -1)
  return token
}

function nameTokens(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|ltr|litre|ea|each)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => singularToken(token.trim()))
    .filter((token) => token.length > 1 && !ignoredTokens.has(token) && !/^\d+$/.test(token))
}

function candidateScore(itemName: string, productName: string) {
  const itemTokens = nameTokens(itemName)
  const productTokens = nameTokens(productName)

  if (itemTokens.length === 0 || productTokens.length === 0) return 0

  const itemKey = itemTokens.join(' ')
  const productKey = productTokens.join(' ')
  if (itemKey === productKey) return 1

  const productSet = new Set(productTokens)
  const shared = itemTokens.filter((token) => productSet.has(token)).length
  if (shared === 0) return 0

  const itemCoverage = shared / itemTokens.length
  const productPrecision = shared / productTokens.length
  const containsBonus = itemKey.includes(productKey) || productKey.includes(itemKey) ? 0.12 : 0

  return Math.min(0.99, itemCoverage * 0.72 + productPrecision * 0.28 + containsBonus)
}

function inferredProductUnit(product: {
  weight: string | null
  packSize: string | null
  name: string
  linkedItem: { unitType: string } | null
}): UnitType {
  if (product.linkedItem?.unitType === 'g' || product.linkedItem?.unitType === 'ml') {
    return product.linkedItem.unitType
  }

  const text = `${product.name} ${product.packSize || ''} ${product.weight || ''}`.toLowerCase()
  if (/\b\d+(?:\.\d+)?\s*(?:kg|g)\b/.test(text)) return 'g'
  if (/\b\d+(?:\.\d+)?\s*(?:ml|l|ltr|litre)\b/.test(text)) return 'ml'
  return 'each'
}

export async function POST() {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to suggest supplier product pairs.' },
        { status: 403 }
      )
    }

    const [items, products] = await Promise.all([
      prisma.item.findMany({
        where: {
          restaurantId: tenant.restaurantId,
          itemType: 'L3',
          supplierProducts: { none: {} },
        },
        select: { id: true, sku: true, name: true, unitType: true },
        orderBy: { name: 'asc' },
        take: 150,
      }),
      prisma.supplierProduct.findMany({
        where: { restaurantId: tenant.restaurantId },
        include: { linkedItem: { select: { id: true, name: true, sku: true, unitType: true } } },
        orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
      }),
    ])

    if (items.length === 0) {
      return NextResponse.json({ attempted: 0, suggestions: [], noCandidates: 0 })
    }

    const candidatesByItem = new Map<string, Candidate[]>()

    for (const item of items) {
      const candidates = products
        .map((product) => {
          const unitType = inferredProductUnit(product)
          const productName = `${product.name} ${product.linkedItem?.name || ''}`
          const score = unitType === item.unitType ? candidateScore(item.name, productName) : 0

          return {
            productId: product.id,
            supplier: product.supplier,
            supplierSku: product.supplierSku,
            name: product.name,
            packSize: product.packSize,
            weight: product.weight,
            unitPrice: product.unitPrice,
            unitType,
            currentL3: product.linkedItem?.name || null,
            score,
          }
        })
        .filter((candidate) => candidate.score > 0)
        .sort((first, second) => second.score - first.score)
        .slice(0, 15)

      candidatesByItem.set(item.id, candidates)
    }

    const matchableItems = items.filter((item) => (candidatesByItem.get(item.id) || []).length > 0)

    if (matchableItems.length === 0) {
      return NextResponse.json({
        attempted: items.length,
        suggestions: [],
        noCandidates: items.length,
      })
    }

    const prompt = `
You match generic kitchen recipe ingredients to supplier catalogue products.

For every L3 item below, return every supplier product candidate that genuinely represents the
same ingredient. Several products from one supplier or several suppliers may all match one L3.

Rules:
- The food ingredient must be genuinely equivalent. Never guess from a weak word overlap.
- Respect the unit family. Weight products use g, liquids use ml, countable products use each.
- Brand and pack size may differ, but the ingredient itself must match.
- Preparation matters when it changes the ingredient: do not match pickled, cooked, smoked, dried, sweetened or flavoured products to a plain ingredient unless the L3 says so.
- Prefer a candidate already linked to a near-identical L3.
- Return confidence from 0 to 1. Omit a candidate when confidence would be below 0.65.
- Keep each reason under 12 words.
- The same itemId may appear several times, once for each genuine product match.
- Do not return the same productId for more than one L3.

Return JSON only in this shape:
{
  "matches": [
    {
      "itemId": "item id",
      "productId": "candidate product id",
      "confidence": 0.0,
      "reason": "short reason"
    }
  ]
}

Items and allowed candidates:
${JSON.stringify(
  matchableItems.map((item) => ({
    itemId: item.id,
    name: item.name,
    sku: item.sku,
    unitType: item.unitType,
    candidates: candidatesByItem.get(item.id),
  }))
)}
`

    const aiResult = await parseJsonWithOpenAI<PairingAiResponse>({
      restaurantId: tenant.restaurantId,
      feature: 'l3_pairing',
      prompt,
      timeoutMs: 90_000,
      qualityCheck: (value) => Array.isArray(value.matches),
    })

    const validItemIds = new Set(matchableItems.map((item) => item.id))
    const suggestions = (aiResult.matches || [])
      .map((match) => {
        const itemId = String(match.itemId || '')
        const productId = match.productId ? String(match.productId) : null
        const confidence = Math.max(0, Math.min(1, Number(match.confidence) || 0))
        const allowedProductIds = new Set(
          (candidatesByItem.get(itemId) || []).map((candidate) => candidate.productId)
        )

        if (!validItemIds.has(itemId) || !productId || !allowedProductIds.has(productId)) {
          return null
        }

        return {
          itemId,
          productId,
          confidence,
          reason: String(match.reason || 'AI ingredient match').slice(0, 120),
        }
      })
      .filter(
        (
          suggestion
        ): suggestion is { itemId: string; productId: string; confidence: number; reason: string } =>
          Boolean(suggestion)
      )
      .sort((first, second) => second.confidence - first.confidence)

    const usedProductIds = new Set<string>()
    const uniqueSuggestions = suggestions.filter((suggestion) => {
      if (usedProductIds.has(suggestion.productId)) return false
      usedProductIds.add(suggestion.productId)
      return true
    })

    const itemOrder = new Map(items.map((item, index) => [item.id, index]))
    const unitPriceByProductId = new Map(
      products.map((product) => [product.id, product.unitPrice])
    )
    uniqueSuggestions.sort((first, second) => {
      const itemComparison =
        (itemOrder.get(first.itemId) ?? Number.MAX_SAFE_INTEGER) -
        (itemOrder.get(second.itemId) ?? Number.MAX_SAFE_INTEGER)
      if (itemComparison !== 0) return itemComparison

      const firstPrice = unitPriceByProductId.get(first.productId)
      const secondPrice = unitPriceByProductId.get(second.productId)
      const firstHasPrice = typeof firstPrice === 'number' && firstPrice > 0
      const secondHasPrice = typeof secondPrice === 'number' && secondPrice > 0

      if (firstHasPrice && secondHasPrice && firstPrice !== secondPrice) {
        return firstPrice - secondPrice
      }
      if (firstHasPrice !== secondHasPrice) return firstHasPrice ? -1 : 1
      return second.confidence - first.confidence
    })

    return NextResponse.json({
      attempted: items.length,
      suggestions: uniqueSuggestions,
      noCandidates: items.length - matchableItems.length,
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    const aiError = aiErrorResponse(error)
    if (aiError) return aiError

    console.error('POST /api/supplier-products/pair-suggestions failed:', error)
    return NextResponse.json({ error: 'Failed to suggest L3 supplier product pairs.' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to pair supplier products.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const pairs: PairInput[] = Array.isArray(body.pairs)
      ? body.pairs
          .map((pair: unknown) => {
            const value = pair as { itemId?: unknown; productId?: unknown }
            return {
              itemId: String(value.itemId || ''),
              productId: String(value.productId || ''),
            }
          })
          .filter((pair: PairInput) => pair.itemId && pair.productId)
      : []

    if (pairs.length === 0 || pairs.length > 500) {
      return NextResponse.json({ error: 'Choose between 1 and 500 pairs.' }, { status: 400 })
    }

    const productIds = pairs.map((pair) => pair.productId)
    if (new Set(productIds).size !== productIds.length) {
      return NextResponse.json(
        { error: 'A supplier product can only be paired with one L3 ingredient.' },
        { status: 400 }
      )
    }

    const itemIds = Array.from(new Set(pairs.map((pair) => pair.itemId)))
    const [validItems, validProducts] = await Promise.all([
      prisma.item.findMany({
        where: {
          restaurantId: tenant.restaurantId,
          id: { in: itemIds },
          itemType: 'L3',
        },
        select: { id: true },
      }),
      prisma.supplierProduct.findMany({
        where: {
          restaurantId: tenant.restaurantId,
          id: { in: productIds },
        },
        select: { id: true },
      }),
    ])

    if (validItems.length !== itemIds.length || validProducts.length !== productIds.length) {
      return NextResponse.json({ error: 'One or more pair selections are no longer valid.' }, { status: 400 })
    }

    const updatedProducts = await prisma.$transaction(
      pairs.map((pair) =>
        prisma.supplierProduct.update({
          where: { id: pair.productId },
          data: { linkedItemId: pair.itemId },
          include: { linkedItem: true },
        })
      )
    )

    return NextResponse.json({ updatedProducts, updatedCount: updatedProducts.length })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('PUT /api/supplier-products/pair-suggestions failed:', error)
    return NextResponse.json({ error: 'Failed to apply L3 supplier product pairs.' }, { status: 500 })
  }
}
