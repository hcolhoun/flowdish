export type PrivateDocumentKind = 'delivery' | 'supplier_price' | 'sales'

type SanitisedDocument = {
  text: string
  removedLineCount: number
  tableBoundaryFound: boolean
}

const TABLE_TERMS = [
  'product',
  'item',
  'code',
  'sku',
  'description',
  'quantity',
  'qty',
  'unit',
  'pack',
  'weight',
  'price',
  'cost',
  'total',
]

const SENSITIVE_LABEL =
  /\b(?:deliver(?:y|ed)?\s+(?:to|address)|ship(?:ped)?\s+to|bill(?:ed)?\s+to|invoice\s+address|customer\s*(?:no\.?|number|account)|account\s*(?:no\.?|number|name|address)|contact\s*(?:name|details)|telephone|phone|mobile|fax|e-?mail|website|vat\s*(?:no\.?|number|registration)|tax\s*(?:id|number)|company\s*(?:no\.?|number|registration)|iban|bic|swift|sort\s*code|bank\s*(?:account|details)|card\s*(?:number|ending)|payment\s*(?:details|terms))\b/i

const ADDRESS_LINE =
  /(?:\b\d{1,5}\s+[\p{L}'-]+(?:\s+[\p{L}'-]+){0,4}\s+(?:street|st\.?|road|rd\.?|avenue|ave\.?|lane|ln\.?|drive|dr\.?|place|pl\.?|square|quay|park)\b|\b(?:business\s+park|industrial\s+estate)\b|\b(?:eircode|postcode|postal\s+code)\b)/iu

const EIRCODE = /\b[AC-FHKNPRTV-Y]\d{2}\s?[0-9AC-FHKNPRTV-Y]{4}\b/gi
const UK_POSTCODE = /\b(?:GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/gi
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const URL = /\b(?:https?:\/\/|www\.)\S+/gi
const IBAN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30}\b/gi
const INTERNATIONAL_PHONE = /(?:\+|\b00)\d[\d\s().-]{7,}\d/g

function normaliseLines(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
}

function tableHeaderScore(line: string) {
  const normalised = line.toLowerCase()
  return TABLE_TERMS.reduce(
    (score, term) => score + (new RegExp(`\\b${term}\\b`, 'i').test(normalised) ? 1 : 0),
    0
  )
}

function isSafeMetadataLine(line: string, kind: PrivateDocumentKind) {
  if (isSensitiveLine(line, kind)) return false

  if (kind === 'delivery') {
    return (
      /\b(?:delivery\s+date|date\s+delivered|invoice\s+date|document\s+date)\b/i.test(line) ||
      /\b(?:docket|delivery\s+note|invoice)\s*(?:no\.?|number|#)\b/i.test(line)
    )
  }

  if (kind === 'sales') {
    return /\b(?:business\s+date|sales\s+date|report\s+date|trading\s+date)\b/i.test(line)
  }

  return /\b(?:price\s+list|effective\s+date|valid\s+from)\b/i.test(line)
}

function isFooterLine(line: string, kind: PrivateDocumentKind) {
  const commonFooter =
    /^(?:sub\s*total|vat\s+total|tax\s+total|grand\s+total|amount\s+due|balance\s+due|payment\s+details|bank\s+details|terms\s+and\s+conditions|received\s+by|signature|thank\s+you)\b/i

  if (commonFooter.test(line)) return true

  return (
    kind === 'sales' &&
    /^(?:payment|payments|tender|tenders|cash|card|credit\s+card|debit\s+card|visa|mastercard|tax\s+summary|vat\s+summary|discount\s+summary)\b/i.test(
      line
    )
  )
}

function isLikelyProductRow(line: string) {
  const numberCount = line.match(/\b\d+(?:[.,]\d+)?\b/g)?.length ?? 0
  const hasLetters = /\p{L}{2,}/u.test(line)
  const hasMoney = /[€£$]|\b\d+[.,]\d{2,4}\b/.test(line)
  const hasUnit =
    /\b(?:kg|g|gram|grams|ml|l|litre|litres|each|case|box|pack|bag|tray|tub|tin|bottle|unit|units)\b/i.test(
      line
    )
  const hasLeadingProductCode = /^[A-Z0-9][A-Z0-9./-]{2,}\s+/i.test(line)

  return (
    hasLetters &&
    ((hasMoney && (numberCount >= 2 || hasUnit || hasLeadingProductCode)) ||
      (numberCount >= 2 && (hasUnit || hasLeadingProductCode)))
  )
}

function redactSensitiveTokens(line: string) {
  return line
    .replace(EMAIL, '[redacted-email]')
    .replace(URL, '[redacted-url]')
    .replace(IBAN, '[redacted-iban]')
    .replace(EIRCODE, '[redacted-postcode]')
    .replace(UK_POSTCODE, '[redacted-postcode]')
    .replace(INTERNATIONAL_PHONE, '[redacted-phone]')
}

function isSensitiveLine(line: string, kind: PrivateDocumentKind) {
  if (SENSITIVE_LABEL.test(line) || ADDRESS_LINE.test(line)) return true

  return (
    kind === 'sales' &&
    /\b(?:customer\s*(?:name|address|phone|email)|staff\s*(?:name|number|id)|employee\s*(?:name|number|id)|cashier|server\s*(?:name|number|id)|waiter|table\s*(?:no\.?|number)|card\s*(?:type|last|ending)|tender\s*(?:type|summary))\b/i.test(
      line
    )
  )
}

export function sanitiseDocumentForAi(
  rawText: string,
  kind: PrivateDocumentKind
): SanitisedDocument {
  const lines = normaliseLines(rawText)
  const metadata = lines.filter((line) => isSafeMetadataLine(line, kind)).slice(0, 4)
  const tableStart = lines.findIndex((line) => tableHeaderScore(line) >= 2)
  const tableBoundaryFound = tableStart >= 0
  const candidateLines = tableBoundaryFound
    ? lines.slice(tableStart)
    : lines.filter(isLikelyProductRow)
  const safeTableLines: string[] = []

  for (const line of candidateLines) {
    if (safeTableLines.length >= 2 && isFooterLine(line, kind)) {
      break
    }

    if (isSensitiveLine(line, kind)) {
      continue
    }

    const redacted = redactSensitiveTokens(line).trim()
    if (!redacted) {
      continue
    }

    safeTableLines.push(redacted)
  }

  const safeMetadata = metadata
    .map(redactSensitiveTokens)
    .filter((line, index, values) => line && values.indexOf(line) === index)
  const text = [...safeMetadata, ...safeTableLines]
    .filter((line, index, values) => values.indexOf(line) === index)
    .join('\n')
    .slice(0, 120000)
    .trim()

  return {
    text,
    removedLineCount: Math.max(0, lines.length - safeMetadata.length - safeTableLines.length),
    tableBoundaryFound,
  }
}

export function matchKnownSupplier(text: string, suppliers: string[]) {
  const normalisedText = text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')

  return (
    [...new Set(suppliers.map((supplier) => supplier.trim()).filter(Boolean))]
      .sort((left, right) => right.length - left.length)
      .find((supplier) => {
        const normalisedSupplier = supplier
          .toLocaleLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .trim()

        return normalisedSupplier.length >= 3 && normalisedText.includes(normalisedSupplier)
      }) ?? null
  )
}
