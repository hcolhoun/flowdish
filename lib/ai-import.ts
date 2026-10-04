import { createRequire } from 'module'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import {
  assertRedactedImageDataUrl,
  assertDocumentTextSize,
  assertDocumentUploadSize,
  MAX_DOCUMENT_UPLOAD_BYTES,
  MAX_REDACTED_IMAGE_BYTES,
} from '@/lib/upload-security'

const require = createRequire(import.meta.url)

export type AiFeature =
  | 'delivery_docket'
  | 'sales_zread'
  | 'supplier_price_import'
  | 'l2_prep_time'
  | 'waste_voice'
  | 'prep_voice'
  | 'dashboard_briefing'
  | 'sop_draft'
  | 'sop_translation'

type OpenAiOptions<T> = {
  restaurantId: string
  feature: AiFeature
  prompt: string
  imageDataUrl?: string
  imageDataUrls?: string[]
  documentPages?: number
  qualityCheck?: (value: T) => boolean
  timeoutMs?: number
}

type OpenAiResponse = {
  model?: string
  choices?: Array<{
    message?: {
      content?: string
      refusal?: string | null
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    prompt_tokens_details?: {
      cached_tokens?: number
    }
  }
  error?: {
    message?: string
    code?: string
    type?: string
  }
}

export function cleanText(value: unknown) {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function supportedImageMimeType(file: File) {
  const declaredType = file.type.toLowerCase()
  const extension = file.name.toLowerCase().split('.').pop()
  const extensionTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  }
  const resolvedType = declaredType.startsWith('image/')
    ? declaredType
    : extension
      ? extensionTypes[extension]
      : undefined

  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(resolvedType || '')
    ? resolvedType
    : null
}

export function extractJson(text: string) {
  const cleaned = text
    .replace(/^```json/i, '')
    .replace(/^```/i, '')
    .replace(/```$/i, '')
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1))
    }

    throw new Error('OPENAI_INVALID_JSON')
  }
}

function primaryOpenAiModel() {
  return process.env.OPENAI_MODEL || 'gpt-5.4-mini-2026-03-17'
}

function fallbackOpenAiModel(primaryModel: string) {
  const configured = process.env.OPENAI_FALLBACK_MODEL

  if (configured?.toLowerCase() === 'none') return null
  if (configured) return configured === primaryModel ? null : configured
  return null
}

type ModelPricing = {
  input: number
  cachedInput: number
  output: number
}

function pricingForModel(model: string): ModelPricing | null {
  if (model === 'gpt-5.4-mini' || model.startsWith('gpt-5.4-mini-')) {
    return { input: 0.75, cachedInput: 0.075, output: 4.5 }
  }

  if (model === 'gpt-5.4-nano' || model.startsWith('gpt-5.4-nano-')) {
    return { input: 0.2, cachedInput: 0.02, output: 1.25 }
  }

  return null
}

function estimatedOpenAiCostUsd(
  model: string,
  promptTokens: number | null,
  cachedPromptTokens: number | null,
  completionTokens: number | null
) {
  const pricing = pricingForModel(model)
  if (!pricing || promptTokens === null || completionTokens === null) return null

  const cached = Math.max(0, Math.min(promptTokens, cachedPromptTokens ?? 0))
  const uncached = promptTokens - cached

  return (
    (uncached * pricing.input + cached * pricing.cachedInput + completionTokens * pricing.output) /
    1_000_000
  )
}

async function runOpenAiJsonRequest<T>({
  apiKey,
  restaurantId,
  feature,
  prompt,
  model,
  imageDataUrl,
  imageDataUrls,
  documentPages = 0,
  qualityCheck,
  timeoutMs = imageDataUrl || imageDataUrls?.length ? 90_000 : 60_000,
}: OpenAiOptions<T> & { apiKey: string; model: string }) {
  const images = imageDataUrls?.length ? imageDataUrls : imageDataUrl ? [imageDataUrl] : []
  const content = images.length
    ? [
        { type: 'text', text: prompt },
        ...images.map((url) => ({
          type: 'image_url',
          image_url: { url, detail: 'original' },
        })),
      ]
    : prompt

  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), timeoutMs)
  let response: Response
  let json: OpenAiResponse

  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content }],
        response_format: { type: 'json_object' },
        store: false,
        stream: false,
      }),
      signal: abortController.signal,
    })
    json = (await response.json()) as OpenAiResponse
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error('OPENAI_TIMEOUT')
    }

    console.error('OpenAI request could not be reached:', error)
    throw new Error('OPENAI_UNAVAILABLE')
  } finally {
    clearTimeout(timeout)
  }

  const promptTokens = Number.isInteger(json.usage?.prompt_tokens)
    ? json.usage?.prompt_tokens ?? null
    : null
  const cachedPromptTokens = Number.isInteger(json.usage?.prompt_tokens_details?.cached_tokens)
    ? json.usage?.prompt_tokens_details?.cached_tokens ?? null
    : null
  const completionTokens = Number.isInteger(json.usage?.completion_tokens)
    ? json.usage?.completion_tokens ?? null
    : null
  const responseModel = json.model || model

  await prisma.aiUsageLog.create({
    data: {
      restaurantId,
      feature,
      provider: 'openai',
      model: responseModel,
      promptTokens,
      cachedPromptTokens,
      completionTokens,
      totalTokens: Number.isInteger(json.usage?.total_tokens) ? json.usage?.total_tokens : null,
      estimatedCostUsd: estimatedOpenAiCostUsd(
        responseModel,
        promptTokens,
        cachedPromptTokens,
        completionTokens
      ),
      documentPages: response.ok ? Math.max(0, Math.floor(documentPages)) : 0,
    },
  })

  if (!response.ok) {
    console.error('OpenAI parse failed:', json)
    const message = String(json.error?.message || '')
    const errorCode = String(json.error?.code || json.error?.type || '')

    if (
      response.status === 401 ||
      response.status === 403 ||
      message.toLowerCase().includes('authentication')
    ) {
      throw new Error('OPENAI_AUTH_FAILED')
    }

    if (
      response.status === 429 &&
      `${message} ${errorCode}`.toLowerCase().includes('quota')
    ) {
      throw new Error('OPENAI_QUOTA_EXCEEDED')
    }

    if (response.status === 429) {
      throw new Error('OPENAI_RATE_LIMITED')
    }

    throw new Error('OPENAI_REQUEST_FAILED')
  }

  if (json.choices?.[0]?.message?.refusal) {
    throw new Error('OPENAI_REQUEST_FAILED')
  }

  const outputText = json.choices?.[0]?.message?.content || ''
  const parsed = extractJson(outputText) as T

  if (qualityCheck && !qualityCheck(parsed)) {
    throw new Error('OPENAI_LOW_CONFIDENCE')
  }

  return parsed
}

export async function parseJsonWithOpenAI<T>({
  restaurantId,
  feature,
  prompt,
  imageDataUrl,
  imageDataUrls,
  documentPages,
  qualityCheck,
  timeoutMs,
}: OpenAiOptions<T>) {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY_MISSING')
  }

  const primaryModel = primaryOpenAiModel()
  const fallbackModel = fallbackOpenAiModel(primaryModel)
  const options = {
    restaurantId,
    feature,
    prompt,
    imageDataUrl,
    imageDataUrls,
    documentPages,
    qualityCheck,
    timeoutMs,
  }

  try {
    return await runOpenAiJsonRequest({
      ...options,
      apiKey,
      model: primaryModel,
    })
  } catch (error) {
    if (
      !fallbackModel ||
      (error instanceof Error &&
        ['OPENAI_API_KEY_MISSING', 'OPENAI_AUTH_FAILED'].includes(error.message))
    ) {
      throw error
    }

    return runOpenAiJsonRequest({
      ...options,
      apiKey,
      model: fallbackModel,
    })
  }
}

function textFromWorkbook(buffer: Buffer) {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: false,
    raw: false,
  })

  const sheetTexts = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null>>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    })

    const textRows = rows
      .map((row) =>
        row
          .map((cell) => String(cell ?? '').trim())
          .filter(Boolean)
          .join('\t')
      )
      .filter(Boolean)

    return [`Sheet: ${sheetName}`, ...textRows].join('\n')
  })

  return sheetTexts.join('\n\n').trim()
}

async function uploadTextFromFile(file: File) {
  assertDocumentUploadSize(file)

  const mimeType = file.type || 'application/octet-stream'
  const fileName = file.name || 'upload'
  const lowerName = fileName.toLowerCase()
  const buffer = Buffer.from(await file.arrayBuffer())
  const isPdf = mimeType === 'application/pdf' || lowerName.endsWith('.pdf')
  const isText =
    mimeType.startsWith('text/') ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.csv')
  const isSpreadsheet =
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    mimeType.includes('spreadsheet') ||
    mimeType === 'application/vnd.ms-excel'

  if (mimeType.startsWith('image/')) {
    throw new Error('OCR_PROVIDER_REQUIRED')
  }

  if (isPdf) {
    const pdf = require('pdf-parse/lib/pdf-parse.js')
    const parsed = await pdf(buffer)
    const text = String(parsed.text || '').trim()

    if (text.length < 30) throw new Error('OCR_PROVIDER_REQUIRED')
    return {
      text,
      documentPages: Math.max(1, Number(parsed.numpages) || 1),
    }
  }

  if (isSpreadsheet) {
    const text = textFromWorkbook(buffer)

    if (text.length < 30) throw new Error('EMPTY_SPREADSHEET')
    return { text, documentPages: 1 }
  }

  if (isText) {
    return { text: buffer.toString('utf8').trim(), documentPages: 1 }
  }

  throw new Error('UNSUPPORTED_FILE')
}

export async function textFromUploadFile(file: File) {
  return (await uploadTextFromFile(file)).text
}

export async function textFromAiRequest(req: Request, textKeys = ['ocrText', 'pastedText', 'text']) {
  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const body = await req.json()
    const text = textKeys.map((key) => cleanText(body?.[key])).find(Boolean) || ''

    if (text.length < 30) throw new Error('OCR_TEXT_TOO_SHORT')
    assertDocumentTextSize(text)
    return { text, body, documentPages: 1 }
  }

  const formData = await req.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    throw new Error('NO_FILE_UPLOADED')
  }

  const body: Record<string, string> = {
    sourceFileName: file.name,
  }

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) continue
    body[key] = String(value)
  }

  const document = await uploadTextFromFile(file)

  return { ...document, body }
}

export async function documentFromAiRequest(
  req: Request,
  textKeys = ['ocrText', 'pastedText', 'text']
) {
  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const body = await req.json()
    const redactedImageDataUrl = cleanText(body?.redactedImageDataUrl)
    const redactedImageDataUrls = Array.isArray(body?.redactedImageDataUrls)
      ? body.redactedImageDataUrls
          .map((value: unknown) => cleanText(value))
          .filter((value: string | null): value is string => Boolean(value))
      : []

    if (redactedImageDataUrls.length > 3) {
      throw new Error('TOO_MANY_IMAGES')
    }

    if (redactedImageDataUrls.length > 0) {
      if (body?.privacySelectionConfirmed !== true) {
        throw new Error('PRIVACY_SELECTION_NOT_CONFIRMED')
      }

      return {
        text: null,
        imageDataUrl: null,
        imageDataUrls: redactedImageDataUrls.map(assertRedactedImageDataUrl),
        documentPages: redactedImageDataUrls.length,
        body,
      }
    }

    if (redactedImageDataUrl) {
      if (body?.privacySelectionConfirmed !== true) {
        throw new Error('PRIVACY_SELECTION_NOT_CONFIRMED')
      }

      return {
        text: null,
        imageDataUrl: assertRedactedImageDataUrl(redactedImageDataUrl),
        imageDataUrls: null,
        documentPages: 1,
        body,
      }
    }

    const text = textKeys.map((key) => cleanText(body?.[key])).find(Boolean) || ''

    if (text.length < 30) throw new Error('OCR_TEXT_TOO_SHORT')
    assertDocumentTextSize(text)

    return {
      text,
      imageDataUrl: null,
      imageDataUrls: null,
      documentPages: 1,
      body,
    }
  }

  const result = await textFromAiRequest(req, textKeys)

  return {
    ...result,
    imageDataUrl: null,
    imageDataUrls: null,
  }
}

export function aiErrorResponse(error: unknown) {
  if (error instanceof Error && error.message === 'OPENAI_API_KEY_MISSING') {
    return Response.json({ error: 'OPENAI_API_KEY is not configured.' }, { status: 500 })
  }

  if (error instanceof Error && error.message === 'OPENAI_AUTH_FAILED') {
    return Response.json(
      {
        error:
          'OpenAI rejected the API key. Replace OPENAI_API_KEY in Vercel Production, then redeploy.',
      },
      { status: 500 }
    )
  }

  if (error instanceof Error && error.message === 'OPENAI_QUOTA_EXCEEDED') {
    return Response.json(
      { error: 'The OpenAI API account has no available credit or has reached its spend limit.' },
      { status: 503 }
    )
  }

  if (error instanceof Error && error.message === 'OPENAI_RATE_LIMITED') {
    return Response.json(
      { error: 'The AI reader is busy. Wait a moment and try again.' },
      { status: 429 }
    )
  }

  if (error instanceof Error && error.message === 'OPENAI_TIMEOUT') {
    return Response.json(
      {
        error:
          'The AI reader took too long to respond. Flowdish stopped the request; try again in a moment.',
      },
      { status: 504 }
    )
  }

  if (error instanceof Error && error.message === 'OPENAI_UNAVAILABLE') {
    return Response.json(
      {
        error:
          'Flowdish could not reach the AI reader. Check the connection and try again in a moment.',
      },
      { status: 502 }
    )
  }

  if (error instanceof Error && error.message === 'OPENAI_REQUEST_FAILED') {
    return Response.json(
      { error: 'The AI reader rejected this request. Try the image again or use manual entry.' },
      { status: 502 }
    )
  }

  if (error instanceof Error && error.message === 'OCR_PROVIDER_REQUIRED') {
    return Response.json(
      {
        error:
          'This file needs image reading before AI can parse it. Use Take Photo for image files, or upload a text-based PDF, Excel, TXT, or CSV file.',
      },
      { status: 400 }
    )
  }

  if (error instanceof Error && error.message === 'OCR_TEXT_TOO_SHORT') {
    return Response.json({ error: 'OCR/text input did not contain enough readable text.' }, { status: 400 })
  }

  if (error instanceof Error && error.message === 'INVALID_REDACTED_IMAGE') {
    return Response.json(
      { error: 'The selected image could not be verified. Review the image and try again.' },
      { status: 400 }
    )
  }

  if (error instanceof Error && error.message === 'PRIVACY_SELECTION_NOT_CONFIRMED') {
    return Response.json(
      { error: 'Confirm that the selected image area contains no sensitive data.' },
      { status: 400 }
    )
  }

  if (error instanceof Error && error.message === 'REDACTED_IMAGE_TOO_LARGE') {
    return Response.json(
      {
        error: `The processed image is too large. Keep it below ${Math.round(
          MAX_REDACTED_IMAGE_BYTES / 1024 / 1024
        )} MB.`,
      },
      { status: 413 }
    )
  }

  if (error instanceof Error && error.message === 'TOO_MANY_IMAGES') {
    return Response.json(
      { error: 'Upload up to 3 docket photos at a time, or combine additional pages into a PDF.' },
      { status: 400 }
    )
  }

  if (error instanceof Error && error.message === 'NO_FILE_UPLOADED') {
    return Response.json({ error: 'No file uploaded.' }, { status: 400 })
  }

  if (error instanceof Error && error.message === 'UNSUPPORTED_FILE') {
    return Response.json({ error: 'Upload a PDF, Excel, TXT, CSV, or image.' }, { status: 400 })
  }

  if (error instanceof Error && error.message === 'EMPTY_SPREADSHEET') {
    return Response.json({ error: 'No readable rows were found in this Excel file.' }, { status: 400 })
  }

  if (error instanceof Error && error.message === 'UPLOAD_TOO_LARGE') {
    return Response.json(
      {
        error: `The file is too large. Upload a file smaller than ${Math.round(
          MAX_DOCUMENT_UPLOAD_BYTES / 1024 / 1024
        )} MB.`,
      },
      { status: 413 }
    )
  }

  if (error instanceof Error && error.message === 'TEXT_TOO_LARGE') {
    return Response.json(
      { error: 'The document contains too much text. Split it into smaller files.' },
      { status: 413 }
    )
  }

  if (error instanceof Error && error.message === 'OPENAI_INVALID_JSON') {
    return Response.json({ error: 'The AI reader returned unreadable data. Try again.' }, { status: 500 })
  }

  if (error instanceof Error && error.message === 'OPENAI_LOW_CONFIDENCE') {
    return Response.json(
      { error: 'The AI could not read this reliably. Try a clearer file or enter it manually.' },
      { status: 422 }
    )
  }

  return null
}
