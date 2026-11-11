import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { parseJsonWithOpenAI } from '@/lib/ai-import'

type ServiceTimeEstimate = {
  batchSize: number
  setupMinutes: number
  activeServiceMinutes: number
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

function batchSizeValue(value: unknown) {
  const number = Math.round(nonNegativeNumber(value))
  return Math.max(1, Math.min(500, number || 1))
}

function confidenceValue(value: unknown) {
  return Math.max(0, Math.min(1, nonNegativeNumber(value)))
}

export async function getL1ServiceTimeContext(restaurantId: string, itemId: string) {
  const item = await prisma.item.findFirst({
    where: {
      id: itemId,
      restaurantId,
      itemType: 'L1',
    },
  })

  if (!item) throw new Error('L1_NOT_FOUND')

  const [prepRows, ingredientRows, sop] = await Promise.all([
    prisma.bomL1L2.findMany({
      where: {
        restaurantId,
        l1ItemId: itemId,
      },
      include: { l2: true },
      orderBy: { id: 'asc' },
    }),
    prisma.bomL1L3.findMany({
      where: {
        restaurantId,
        l1ItemId: itemId,
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
      sellingPrice: item.sellingPrice,
    },
    preparedComponentsPerServing: prepRows.map((row) => ({
      sku: row.l2.sku,
      name: row.l2.name,
      qty: row.qty,
      unitType: row.l2.unitType,
    })),
    directIngredientsPerServing: ingredientRows.map((row) => ({
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

export async function markL1ServiceTimeStale(restaurantId: string, itemId: string) {
  await prisma.item.updateMany({
    where: {
      id: itemId,
      restaurantId,
      itemType: 'L1',
      serviceTimeStatus: {
        in: ['ESTIMATED', 'CONFIRMED'],
      },
    },
    data: {
      serviceTimeStatus: 'STALE',
    },
  })
}

export async function calculateL1ServiceTime(restaurantId: string, itemId: string) {
  const { context, fingerprint } = await getL1ServiceTimeContext(restaurantId, itemId)

  const prompt = `
You are estimating on-the-day commercial kitchen service labour for an L1 plated dish.

Return ONLY valid JSON with this exact shape:
{
  "batchSize": number,
  "setupMinutes": number,
  "activeServiceMinutes": number,
  "cleanupMinutes": number,
  "passiveMinutes": number,
  "confidence": number,
  "assumptions": string[]
}

Definitions:
- batchSize: a realistic number of portions normally cooked, finished, or plated together during service. Use 1 for a genuinely made-to-order single portion.
- setupMinutes: hands-on gathering, station setup, heating equipment, and arranging components for that service batch.
- activeServiceMinutes: hands-on cooking attention, reheating, finishing, portioning, assembling, garnishing, and plating for that service batch.
- cleanupMinutes: dish-specific hands-on cleaning and putting away after that service batch. Do not include whole-kitchen closing.
- passiveMinutes: unattended cooking, resting, reheating, or holding time for that service batch.
- confidence: 0 to 1.

Rules:
- Estimate for a competent chef in a normal professional kitchen.
- Estimate one realistic service batch and return how many plated portions that batch produces.
- Treat every L2 component as fully prepared before service. Do not include the labour used to produce L2 components.
- Include only the on-the-day handling, heating, finishing, portioning, and plating of L2 components.
- Include transformations of direct L3 ingredients only when required by the SOP or clearly necessary to serve the finished dish.
- Do not count passive time as hands-on labour.
- Allow for normal batching and parallel work. Do not multiply a shared oven or pan cycle as though every portion were cooked separately.
- Do not add breaks, management, general kitchen setup, general closing, waiting for deliveries, or roster inefficiency.
- Use the SOP where it gives useful method detail.
- If the method is unclear, make conservative assumptions and list them.
- Output JSON only.

L1 context:
${JSON.stringify(context, null, 2)}
`

  const estimate = await parseJsonWithOpenAI<ServiceTimeEstimate>({
    restaurantId,
    feature: 'l1_service_time',
    prompt,
  })

  const batchSize = batchSizeValue(estimate.batchSize)
  const setupMinutes = roundedMinutes(estimate.setupMinutes)
  const activeServiceMinutes = roundedMinutes(estimate.activeServiceMinutes)
  const cleanupMinutes = roundedMinutes(estimate.cleanupMinutes)
  const passiveMinutes = roundedMinutes(estimate.passiveMinutes)
  const handsOnMinutes = roundedMinutes(setupMinutes + activeServiceMinutes + cleanupMinutes)
  const elapsedMinutes = roundedMinutes(handsOnMinutes + passiveMinutes)
  const assumptions = Array.isArray(estimate.assumptions)
    ? estimate.assumptions.map((value) => String(value).trim()).filter(Boolean).slice(0, 12)
    : []

  return prisma.item.update({
    where: { id: itemId },
    data: {
      serviceBatchSize: batchSize,
      serviceSetupMinutes: setupMinutes,
      serviceActiveMinutes: activeServiceMinutes,
      serviceCleanupMinutes: cleanupMinutes,
      servicePassiveMinutes: passiveMinutes,
      serviceHandsOnMinutes: handsOnMinutes,
      serviceElapsedMinutes: elapsedMinutes,
      serviceTimeConfidence: confidenceValue(estimate.confidence),
      serviceTimeAssumptions: assumptions,
      serviceTimeStatus: 'ESTIMATED',
      serviceTimeFingerprint: fingerprint,
      serviceTimeCalculatedAt: new Date(),
      serviceTimeConfirmedAt: null,
      serviceTimeConfirmedBy: null,
    },
  })
}
