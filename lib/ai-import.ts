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

type DeepSeekOptions<T> = {
  restaurantId: string
  feature: AiFeature
  prompt: string
  imageDataUrl?: string
  qualityCheck?: (value: T) => boolean
}

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  error?: {
    message?: string
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

    throw new Error('DEEPSEEK_INVALID_JSON')
  }
}

function primaryDeepSeekModel() {
  return process.env.DEEPSEEK_MODEL || 'deepseek-flash'
}

function fallbackDeepSeekModel(primaryModel: string) {
  const configured = process.env.DEEPSEEK_FALLBACK_MODEL

  if (configured?.toLowerCase() === 'none') return null
  if (configured) return configured === primaryModel ? null : configured
  return primaryModel === 'deepseek-v4-pro' ? null : 'deepseek-v4-pro'
}

async function runDeepSeekJsonRequest<T>({
  apiKey,
  restaurantId,
  feature,
  prompt,
  model,
  imageDataUrl,
  qualityCheck,
}: DeepSeekOptions<T> & { apiKey: string; model: string }) {
  const content = imageDataUrl
    ? [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: { url: imageDataUrl, detail: 'original' },
        },
      ]
    : prompt

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
      stream: false,
    }),
  })

  const json = (await response.json()) as DeepSeekResponse

  await prisma.aiUsageLog.create({
    data: {
      restaurantId,
      feature,
      model,
      promptTokens: Number.isInteger(json.usage?.prompt_tokens)
        ? json.usage?.prompt_tokens
        : null,
      completionTokens: Number.isInteger(json.usage?.completion_tokens)
        ? json.usage?.completion_tokens
        : null,
      totalTokens: Number.isInteger(json.usage?.total_tokens) ? json.usage?.total_tokens : null,
    },
  })

  if (!response.ok) {
    console.error('DeepSeek parse failed:', json)
    const message = String(json.error?.message || '')

    if (
      response.status === 401 ||
      response.status === 403 ||
      message.toLowerCase().includes('authentication')
    ) {
      throw new Error('DEEPSEEK_AUTH_FAILED')
    }

    throw new Error('DEEPSEEK_REQUEST_FAILED')
  }

  const outputText = json.choices?.[0]?.message?.content || ''
  const parsed = extractJson(outputText) as T

  if (qualityCheck && !qualityCheck(parsed)) {
    throw new Error('DEEPSEEK_LOW_CONFIDENCE')
  }

  return parsed
}

export async function parseJsonWithDeepSeek<T>({
  restaurantId,
  feature,
  prompt,
  imageDataUrl,
  qualityCheck,
}: DeepSeekOptions<T>) {
  const apiKey = process.env.DEEPSEEK_API_KEY

  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY_MISSING')
  }

  const primaryModel = imageDataUrl ? 'deepseek-flash' : primaryDeepSeekModel()
  const fallbackModel = imageDataUrl ? null : fallbackDeepSeekModel(primaryModel)
  const options = { restaurantId, feature, prompt, imageDataUrl, qualityCheck }

  try {
    return await runDeepSeekJsonRequest({
      ...options,
      apiKey,
      model: primaryModel,
    })
  } catch (error) {
    if (
      !fallbackModel ||
      (error instanceof Error &&
        ['DEEPSEEK_API_KEY_MISSING', 'DEEPSEEK_AUTH_FAILED'].includes(error.message))
    ) {
      throw error
    }

    return runDeepSeekJsonRequest({
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

export async function textFromUploadFile(file: File) {
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
    return text
  }

  if (isSpreadsheet) {
    const text = textFromWorkbook(buffer)

    if (text.length < 30) throw new Error('EMPTY_SPREADSHEET')
    return text
  }

  if (isText) {
    return buffer.toString('utf8').trim()
  }

  throw new Error('UNSUPPORTED_FILE')
}

export async function textFromAiRequest(req: Request, textKeys = ['ocrText', 'pastedText', 'text']) {
  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const body = await req.json()
    const text = textKeys.map((key) => cleanText(body?.[key])).find(Boolean) || ''

    if (text.length < 30) throw new Error('OCR_TEXT_TOO_SHORT')
    assertDocumentTextSize(text)
    return { text, body }
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

  return {
    text: await textFromUploadFile(file),
    body,
  }
}

export async function documentFromAiRequest(
  req: Request,
  textKeys = ['ocrText', 'pastedText', 'text']
) {
  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const body = await req.json()
    const redactedImageDataUrl = cleanText(body?.redactedImageDataUrl)

    if (redactedImageDataUrl) {
      return {
        text: null,
        imageDataUrl: assertRedactedImageDataUrl(redactedImageDataUrl),
        body,
      }
    }

    const text = textKeys.map((key) => cleanText(body?.[key])).find(Boolean) || ''

    if (text.length < 30) throw new Error('OCR_TEXT_TOO_SHORT')
    assertDocumentTextSize(text)

    return {
      text,
      imageDataUrl: null,
      body,
    }
  }

  const result = await textFromAiRequest(req, textKeys)

  return {
    ...result,
    imageDataUrl: null,
  }
}

export function aiErrorResponse(error: unknown) {
  if (error instanceof Error && error.message === 'DEEPSEEK_API_KEY_MISSING') {
    return Response.json({ error: 'DEEPSEEK_API_KEY is not configured.' }, { status: 500 })
  }

  if (error instanceof Error && error.message === 'DEEPSEEK_AUTH_FAILED') {
    return Response.json(
      {
        error:
          'DeepSeek rejected the API key. Create a new key in the DeepSeek Platform, replace DEEPSEEK_API_KEY in Vercel Production, then redeploy.',
      },
      { status: 500 }
    )
  }

  if (error instanceof Error && error.message === 'OCR_PROVIDER_REQUIRED') {
    return Response.json(
      {
        error:
          'This file needs OCR before DeepSeek can parse it. Use Take Photo for image files, or upload a text-based PDF, Excel, TXT, or CSV file.',
      },
      { status: 400 }
    )
  }

  if (error instanceof Error && error.message === 'OCR_TEXT_TOO_SHORT') {
    return Response.json({ error: 'OCR/text input did not contain enough readable text.' }, { status: 400 })
  }

  if (error instanceof Error && error.message === 'INVALID_REDACTED_IMAGE') {
    return Response.json(
      { error: 'The redacted image could not be verified. Review the image and try again.' },
      { status: 400 }
    )
  }

  if (error instanceof Error && error.message === 'REDACTED_IMAGE_TOO_LARGE') {
    return Response.json(
      {
        error: `The redacted image is too large. Keep it below ${Math.round(
          MAX_REDACTED_IMAGE_BYTES / 1024 / 1024
        )} MB.`,
      },
      { status: 413 }
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

  if (error instanceof Error && error.message === 'DEEPSEEK_INVALID_JSON') {
    return Response.json({ error: 'DeepSeek returned unreadable JSON. Try again.' }, { status: 500 })
  }

  if (error instanceof Error && error.message === 'DEEPSEEK_LOW_CONFIDENCE') {
    return Response.json(
      { error: 'The AI could not read this reliably. Try a clearer file or enter it manually.' },
      { status: 422 }
    )
  }

  return null
}
