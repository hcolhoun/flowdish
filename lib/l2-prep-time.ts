import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { parseJsonWithDeepSeek } from '@/lib/ai-import'

type PrepTimeEstimate = {
  setupMinutes: number
  activePrepMinutes: number
  cleanupMinutes: number
  passiveMinutes: number
  confidence: number
  assumptions: string[]
}

function nonNegativeNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

function roundedMinutes(value: unknown) {
  return Math.round(nonNegativeNumber(value) * 10) / 10
}

function confidenceValue(value: unknown) {
  return Math.max(0, Math.min(1, nonNegativeNumber(value)))
}

export async function getL2PrepTimeContext(restaurantId: string, itemId: string) {
  const item = await prisma.item.findFirst({
    where: {
      id: itemId,
      restaurantId,
      itemType: 'L2',
    },
  })

  if (!item) throw new Error('L2_NOT_FOUND')

  const [childL2Rows, ingredientRows, sop] = await Promise.all([
    prisma.bomL2L2.findMany({
      where: {
        restaurantId,
        parentL2ItemId: itemId,
      },
      include: { childL2: true },
      orderBy: { id: 'asc' },
    }),
    prisma.bomL2L3.findMany({
      where: {
        restaurantId,
        l2ItemId: itemId,
      },
      include: { l3: true },
      orderBy: { id: 'asc' },
    }),
    prisma.sopDocument.findFirst({
      where: {
        restaurantId,
        itemId,
      },
    }),
  ])

  const context = {
    item: {
      id: item.id,
      sku: item.sku,
      name: item.name,
      unitType: item.unitType,
      standardBatchOutput: item.standardBatchOutput,
    },
    childL2Rows: childL2Rows.map((row) => ({
      sku: row.childL2.sku,
      name: row.childL2.name,
      qty: row.qty,
      unitType: row.childL2.unitType,
    })),
    ingredientRows: ingredientRows.map((row) => ({
      sku: row.l3.sku,
      name: row.l3.name,
      qty: row.qty,
      unitType: row.l3.unitType,
    })),
    sopInstructions: sop?.instructions?.trim() || null,
  }

  const fingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify(context))
    .digest('hex')

  return { item, context, fingerprint }
}

export async function markL2PrepTimeStale(restaurantId: string, itemId: string) {
  await prisma.item.updateMany({
    where: {
      id: itemId,
      restaurantId,
      itemType: 'L2',
      prepTimeStatus: {
        in: ['ESTIMATED', 'CONFIRMED'],
      },
    },
    data: {
      prepTimeStatus: 'STALE',
      buildStatus: 'UNBUILT',
    },
  })
}

export async function calculateL2PrepTime(restaurantId: string, itemId: string) {
  const { item, context, fingerprint } = await getL2PrepTimeContext(restaurantId, itemId)

  if (!item.standardBatchOutput || item.standardBatchOutput <= 0) {
    throw new Error('L2_BATCH_OUTPUT_REQUIRED')
  }

  const prompt = `
You are estimating commercial kitchen prep time for one standard batch of an L2 prepared item.

Return ONLY valid JSON with this exact shape:
{
  "setupMinutes": number,
  "activePrepMinutes": number,
  "cleanupMinutes": number,
  "passiveMinutes": number,
  "confidence": number,
  "assumptions": string[]
}

Definitions:
- setupMinutes: hands-on gathering, weighing, equipment setup, and workstation preparation.
- activePrepMinutes: hands-on washing, cutting, mixing, cooking attention, portioning, straining, packing, and similar direct work.
- cleanupMinutes: item-specific hands-on cleaning and putting away. Do not include whole-kitchen closing.
- passiveMinutes: unattended cooking, resting, chilling, proving, marinating, or cooling time.
- confidence: 0 to 1.

Rules:
- Estimate for a competent chef in a normal commercial kitchen.
- Estimate one standard batch, not one serving.
- Do not include the labour needed to make child L2 components. They are planned separately.
- Include only the handling time needed to collect or add already-prepared child L2 components.
- Do not add breaks, general kitchen setup, closing, management, waiting for deliveries, or roster inefficiency.
- Use the SOP where it gives useful method detail.
- If there are no BOM rows, infer cautiously from the item name and SOP. This may represent trim,
  offcuts, rendered fat, breadcrumbs, or another byproduct prep item.
- If the method is unclear, make conservative assumptions and list them.
- Output JSON only.

L2 context:
${JSON.stringify(context, null, 2)}
`

  const estimate = await parseJsonWithDeepSeek<PrepTimeEstimate>({
    restaurantId,
    feature: 'l2_prep_time',
    prompt,
  })

  const setupMinutes = roundedMinutes(estimate.setupMinutes)
  const activePrepMinutes = roundedMinutes(estimate.activePrepMinutes)
  const cleanupMinutes = roundedMinutes(estimate.cleanupMinutes)
  const passiveMinutes = roundedMinutes(estimate.passiveMinutes)
  const handsOnMinutes = roundedMinutes(setupMinutes + activePrepMinutes + cleanupMinutes)
  const elapsedMinutes = roundedMinutes(handsOnMinutes + passiveMinutes)
  const assumptions = Array.isArray(estimate.assumptions)
    ? estimate.assumptions.map((value) => String(value).trim()).filter(Boolean).slice(0, 12)
    : []

  return prisma.item.update({
    where: { id: itemId },
    data: {
      prepSetupMinutes: setupMinutes,
      prepActiveMinutes: activePrepMinutes,
      prepCleanupMinutes: cleanupMinutes,
      prepPassiveMinutes: passiveMinutes,
      prepHandsOnMinutes: handsOnMinutes,
      prepElapsedMinutes: elapsedMinutes,
      prepTimeConfidence: confidenceValue(estimate.confidence),
      prepTimeAssumptions: assumptions,
      prepTimeStatus: 'ESTIMATED',
      prepTimeFingerprint: fingerprint,
      prepTimeCalculatedAt: new Date(),
      prepTimeConfirmedAt: null,
      prepTimeConfirmedBy: null,
      buildStatus: 'UNBUILT',
    },
  })
}
