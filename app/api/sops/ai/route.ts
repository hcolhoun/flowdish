export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  aiErrorResponse,
  cleanText,
  parseJsonWithDeepSeek,
  supportedImageMimeType,
  textFromUploadFile,
} from '@/lib/ai-import'
import { prisma } from '@/lib/prisma'
import { canWrite, requireTenant, tenantErrorResponse } from '@/lib/tenant'

type SopDraft = {
  instructions: string
  notes: string | null
}

const LANGUAGES: Record<string, string> = {
  'en-IE': 'English (Ireland)',
  'pl-PL': 'Polish',
  'ro-RO': 'Romanian',
  'es-ES': 'Spanish',
  'pt-PT': 'Portuguese',
  'fr-FR': 'French',
}

async function selectedItem(restaurantId: string, itemId: string) {
  return prisma.item.findFirst({
    where: {
      id: itemId,
      restaurantId,
      itemType: { in: ['L1', 'L2'] },
    },
    select: { id: true, sku: true, name: true, itemType: true },
  })
}

function cleanDraft(value: SopDraft) {
  return {
    instructions: cleanText(value.instructions)?.slice(0, 30000) || '',
    notes: cleanText(value.notes)?.slice(0, 500) || null,
  }
}

async function convertDocument(req: Request, restaurantId: string) {
  const formData = await req.formData()
  const itemId = cleanText(formData.get('itemId'))
  const file = formData.get('file')

  if (!itemId) {
    return NextResponse.json({ error: 'Select an SOP item first.' }, { status: 400 })
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Choose an SOP document or image first.' }, { status: 400 })
  }

  const item = await selectedItem(restaurantId, itemId)
  if (!item) return NextResponse.json({ error: 'SOP item not found.' }, { status: 404 })

  let sourceText = ''
  let imageDataUrl: string | undefined

  const imageMimeType = supportedImageMimeType(file)
  if (imageMimeType) {
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: 'The SOP image must be under 4 MB.' }, { status: 413 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    imageDataUrl = `data:${imageMimeType};base64,${buffer.toString('base64')}`
  } else {
    sourceText = await textFromUploadFile(file)
  }

  const sourceInstruction = imageDataUrl
    ? 'Read the attached SOP or recipe-method image directly.'
    : `Source document text:\n${sourceText.slice(0, 120000)}`

  const prompt = `
Convert the supplied kitchen document into a clear operational SOP draft for ${item.name} [${item.sku}].

Rules:
- Preserve all factual quantities, temperatures, timings, warnings, allergen notes and critical control points that appear in the source.
- Do not invent missing facts, legal limits, ingredients or food-safety instructions.
- Remove headers, footers, page numbers and duplicated OCR fragments.
- Use one concise numbered instruction per line so it can be read aloud step by step.
- Keep useful headings on their own line.
- Put any uncertainty in notes, not inside an invented instruction.

Return ONLY valid JSON:
{
  "instructions": "plain text SOP with one numbered step per line",
  "notes": string | null
}

${sourceInstruction}
`

  const draft = await parseJsonWithDeepSeek<SopDraft>({
    restaurantId,
    feature: 'sop_draft',
    prompt,
    imageDataUrl,
    qualityCheck: (value) => Boolean(cleanText(value.instructions)?.length && value.instructions.length > 20),
  })

  return NextResponse.json({ draft: cleanDraft(draft), sourceFileName: file.name })
}

async function translateInstructions(req: Request, restaurantId: string) {
  const body = await req.json()
  const itemId = cleanText(body.itemId)
  const instructions = cleanText(body.instructions)
  const targetLanguageCode = cleanText(body.targetLanguage)
  const targetLanguage = targetLanguageCode ? LANGUAGES[targetLanguageCode] : null

  if (!itemId || !instructions) {
    return NextResponse.json({ error: 'Select an SOP with instructions first.' }, { status: 400 })
  }

  if (!targetLanguage || !targetLanguageCode) {
    return NextResponse.json({ error: 'Choose a supported language.' }, { status: 400 })
  }

  const item = await selectedItem(restaurantId, itemId)
  if (!item) return NextResponse.json({ error: 'SOP item not found.' }, { status: 404 })

  const prompt = `
Translate this professional kitchen SOP for ${item.name} [${item.sku}] into ${targetLanguage}.

Rules:
- Preserve numbering, quantities, units, temperatures, timings, allergen names and warnings exactly.
- Use clear language suitable for a chef working during service.
- Do not add, remove or reinterpret food-safety requirements.
- Return only the translated draft and a short note if a technical phrase could be ambiguous.

Return ONLY valid JSON:
{
  "instructions": "translated plain text SOP",
  "notes": string | null
}

SOP instructions:
${instructions.slice(0, 30000)}
`

  const draft = await parseJsonWithDeepSeek<SopDraft>({
    restaurantId,
    feature: 'sop_translation',
    prompt,
    qualityCheck: (value) => Boolean(cleanText(value.instructions)?.length && value.instructions.length > 20),
  })

  return NextResponse.json({
    draft: cleanDraft(draft),
    languageCode: targetLanguageCode,
    languageName: targetLanguage,
  })
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()

    if (!canWrite(tenant.role)) {
      return NextResponse.json({ error: 'You do not have permission to edit SOPs.' }, { status: 403 })
    }

    const contentType = req.headers.get('content-type') || ''
    return await (contentType.includes('multipart/form-data')
      ? convertDocument(req, tenant.restaurantId)
      : translateInstructions(req, tenant.restaurantId))
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    const aiError = aiErrorResponse(error)
    if (aiError) return aiError

    console.error('POST /api/sops/ai failed:', error)
    return NextResponse.json({ error: 'Failed to prepare the SOP draft.' }, { status: 500 })
  }
}
