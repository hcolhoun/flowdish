export const MAX_DOCUMENT_UPLOAD_BYTES = 5 * 1024 * 1024
export const MAX_DOCUMENT_TEXT_CHARS = 160000

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
