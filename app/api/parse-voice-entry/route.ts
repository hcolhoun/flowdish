export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { aiErrorResponse, cleanText, parseJsonWithDeepSeek } from '@/lib/ai-import'
import { kitchenAccessErrorResponse, requireKitchenAccess } from '@/lib/kitchen-access'
import { prisma } from '@/lib/prisma'

type VoiceEntryMode = 'waste' | 'prep'

type ParsedVoiceEntry = {
  itemId: string | null
  itemName: string | null
  quantity: number | null
  date: string | null
  reason: string | null
  confidence: number | null
  notes: string | null
}

function normaliseText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function itemCandidateScore(transcript: string, item: { name: string; sku: string }) {
  const source = normaliseText(transcript)
  const name = normaliseText(item.name)
  const sku = normaliseText(item.sku)

  if (source.includes(name) || (sku && source.includes(sku))) return 1000

  const sourceTokens = new Set(source.split(' ').filter((token) => token.length > 1))
  const itemTokens = `${name} ${sku}`.split(' ').filter((token) => token.length > 1)
  return itemTokens.reduce((score, token) => score + (sourceTokens.has(token) ? 10 : 0), 0)
}

function cleanQuantity(value: unknown) {
  const quantity = Number(value)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null
}

function cleanDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : value
}

export async function POST(req: Request) {
  try {
    const access = await requireKitchenAccess()

    if (!access.canRecordPrepWaste) {
      return NextResponse.json(
        { error: 'You do not have permission to record prep or waste.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const mode = body.mode === 'waste' || body.mode === 'prep' ? body.mode : null
    const transcript = cleanText(body.transcript)

    if (!mode) {
      return NextResponse.json({ error: 'Choose a valid voice entry type.' }, { status: 400 })
    }

    if (!transcript || transcript.length < 3) {
      return NextResponse.json({ error: 'No usable speech was recognised.' }, { status: 400 })
    }

    const itemTypeLabel = mode === 'waste' ? 'L2 or L3' : 'L2'
    const items = await prisma.item.findMany({
      where: {
        restaurantId: access.restaurantId,
        itemType: mode === 'waste' ? { in: ['L2', 'L3'] } : 'L2',
      },
      select: {
        id: true,
        sku: true,
        name: true,
        unitType: true,
      },
      orderBy: [{ name: 'asc' }],
    })

    const candidates = [...items]
      .sort(
        (a, b) =>
          itemCandidateScore(transcript, b) - itemCandidateScore(transcript, a) ||
          a.name.localeCompare(b.name)
      )
      .slice(0, 250)

    const today = new Date().toISOString().slice(0, 10)
    const purpose =
      mode === 'waste'
        ? 'a kitchen waste record for an L2 prep batch or L3 ingredient'
        : 'a completed prep batch for an L2 item'

    const prompt = `
You are preparing ${purpose} from a chef's voice transcript.

Return ONLY valid JSON. No markdown or explanation.

Rules:
- Match only against the supplied item list.
- itemId must be copied exactly from the list, or null when no credible match exists.
- itemName is the product or prep name the chef appears to have said, even if no item matches.
- quantity must be a positive number or null.
- Convert kilograms to grams for items whose unitType is "g".
- Convert litres to millilitres for items whose unitType is "ml".
- For "each" items, retain the stated count.
- date must be YYYY-MM-DD. Today is ${today}. Resolve words such as today or yesterday; otherwise use null.
- reason is only relevant to waste. For prep, return null.
- confidence is from 0 to 1.
- Never invent a product, item ID, quantity, date, or reason.

Return this exact shape:
{
  "itemId": string | null,
  "itemName": string | null,
  "quantity": number | null,
  "date": string | null,
  "reason": string | null,
  "confidence": number | null,
  "notes": string | null
}

Allowed ${itemTypeLabel} items:
${JSON.stringify(candidates)}

Chef transcript:
${JSON.stringify(transcript)}
`

    const parsed = await parseJsonWithDeepSeek<ParsedVoiceEntry>({
      restaurantId: access.restaurantId,
      feature: mode === 'waste' ? 'waste_voice' : 'prep_voice',
      prompt,
    })

    const matchedItem = items.find((item) => item.id === cleanText(parsed.itemId)) ?? null
    const confidenceValue = Number(parsed.confidence)

    return NextResponse.json({
      transcript,
      mode,
      itemId: matchedItem?.id ?? null,
      itemName: matchedItem?.name ?? cleanText(parsed.itemName),
      itemSku: matchedItem?.sku ?? null,
      unitType: matchedItem?.unitType ?? null,
      quantity: cleanQuantity(parsed.quantity),
      date: cleanDate(parsed.date),
      reason: mode === 'waste' ? cleanText(parsed.reason) : null,
      confidence:
        Number.isFinite(confidenceValue) && confidenceValue >= 0 && confidenceValue <= 1
          ? confidenceValue
          : null,
      notes: cleanText(parsed.notes),
      needsReview: !matchedItem || !cleanQuantity(parsed.quantity),
    })
  } catch (error) {
    const accessError = kitchenAccessErrorResponse(error)
    if (accessError) return accessError

    const aiError = aiErrorResponse(error)
    if (aiError) return aiError

    console.error('POST /api/parse-voice-entry failed:', error)
    return NextResponse.json({ error: 'Failed to prepare a voice-entry draft.' }, { status: 500 })
  }
}
