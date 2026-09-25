export const MAX_DOCUMENT_UPLOAD_BYTES = 5 * 1024 * 1024
export const MAX_DOCUMENT_TEXT_CHARS = 160000
export const MAX_REDACTED_IMAGE_BYTES = 3 * 1024 * 1024

export function assertDocumentUploadSize(file: File) {
  if (file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
    throw new Error('UPLOAD_TOO_LARGE')
  }
}

export function assertDocumentTextSize(text: string) {
  if (text.length > MAX_DOCUMENT_TEXT_CHARS) {
    throw new Error('TEXT_TOO_LARGE')
  }
}

export function assertRedactedImageDataUrl(value: string) {
  const match = value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/)

  if (!match) {
    throw new Error('INVALID_REDACTED_IMAGE')
  }

  const [, declaredType, encoded] = match
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0
  const byteLength = Math.floor((encoded.length * 3) / 4) - padding

  if (byteLength > MAX_REDACTED_IMAGE_BYTES) {
    throw new Error('REDACTED_IMAGE_TOO_LARGE')
  }

  const bytes = Buffer.from(encoded.slice(0, 24), 'base64')
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  const isWebp =
    bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'

  const signatureMatches =
    (declaredType === 'jpeg' && isJpeg) ||
    (declaredType === 'png' && isPng) ||
    (declaredType === 'webp' && isWebp)

  if (!signatureMatches) {
    throw new Error('INVALID_REDACTED_IMAGE')
  }

  return value
}
