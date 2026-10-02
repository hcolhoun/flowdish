'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import CopyableError from '@/app/components/CopyableError'
import ImageRedactionEditor, {
  type ImageRedactionEditorHandle,
} from '@/app/components/ImageRedactionEditor'

type UnitType = 'g' | 'ml' | 'each'
type VatReclaimStatus = 'NOT_APPLICABLE' | 'ELIGIBLE' | 'CLAIMED' | 'NOT_CLAIMED'
type DocketLineType =
  | 'product'
  | 'unavailable'
  | 'charged_not_received'
  | 'deposit'
  | 'delivery_fee'
  | 'discount'
  | 'credit'
  | 'other_charge'

type Item = {
  id: string
  sku: string
  name: string
  itemType: 'L1' | 'L2' | 'L3'
  unitType: UnitType
}

type Delivery = {
  id: string
  deliveredAt: string
  qty: number
  unitType: UnitType
  supplier: string | null
  price: number | null
  vatRatePercent: number
  vatAmount: number
  vatReclaimStatus: VatReclaimStatus
  deliveryVehicleOk: boolean
  expiryAt: string | null
  createdAt?: string | null
  enteredByName?: string | null
  enteredByType?: string | null
  item: Item
}

type SupplierProduct = {
  id: string
  supplier: string
  supplierSku: string | null
  name: string
  packSize: string | null
  weight: string | null
  packPrice: number | null
  unitPrice: number | null
  linkedItemId: string | null
  linkedItem?: Item | null
}

type LatestSupplierProduct = {
  id: string
  supplier: string
  supplierSku: string | null
  name: string
  packSize: string | null
  weight: string | null
  packPrice: number | null
  unitPrice: number | null
}

type ParsedDocketRow = {
  supplier: string | null
  supplierSku: string | null
  productName: string
  lineType: DocketLineType
  packSize: string | null
  qty: number | null
  unitType: UnitType | null
  packPrice: number | null
  lineTotal: number | null
  lineTotalIncludesVat: boolean | null
  batchCode: string | null
  expiryDate: string | null
  vatCode: string | null
  vatRatePercent: number | null
  skuConfidence: number | null
  skuReason: string | null
  quantityConfidence: number | null
  quantityReason: string | null
  supplierInferredFromSku: boolean
  notes: string | null
  matchedSupplierProductId: string | null
  matchedSupplierProductName: string | null
  matchedItemId: string | null
  matchedItemSku: string | null
  matchedItemName: string | null
  matchedItemUnitType: UnitType | null
  confidence: number
  matchReason: string
  needsReview: boolean
}

type ParsedDocketResponse = {
  supplier: string | null
  deliveryDate: string | null
  docketNumber: string | null
  totals: {
    goodsTotal: number | null
    vatTotal: number | null
    grandTotal: number | null
    extractedLineTotal: number
    difference: number | null
    matches: boolean | null
    pricedRowCount: number
    rowCount: number
  }
  rows: ParsedDocketRow[]
  rawExtracted?: unknown
}

type ReviewRow = {
  rowId: string
  include: boolean
  chargedNotReceived: boolean
  creditClaimRecorded: boolean
  supplier: string
  supplierSku: string
  productName: string
  lineType: DocketLineType
  packSize: string
  packPrice: string
  qty: string
  unitType: UnitType | ''
  totalCost: string
  priceIncludesVat: boolean
  batchCode: string
  expiryDate: string
  vatCode: string
  vatRatePercent: string
  vatReclaimStatus: VatReclaimStatus
  deliveryVehicleOk: boolean
  selectedItemId: string
  itemSearch: string
  dropdownOpen: boolean
  quantityConfidence: number
  quantityReason: string
  skuConfidence: number
  skuReason: string
  supplierInferredFromSku: boolean
  notes: string
  needsReview: boolean
  matchedSupplierProductId: string | null
}

type EditingDelivery = {
  deliveredAt: string
  qty: string
  supplier: string
  totalCost: string
  expiryAt: string
  vatRatePercent: string
  vatReclaimStatus: VatReclaimStatus
  deliveryVehicleOk: boolean
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 10)
}

function comparableSku(value: string | null | undefined) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function comparableSupplier(value: string | null | undefined) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function supplierNamesMatch(left: string | null | undefined, right: string | null | undefined) {
  const first = comparableSupplier(left)
  const second = comparableSupplier(right)
  return Boolean(first && second && (first === second || first.includes(second) || second.includes(first)))
}

function docketFileKey(file: File, index: number) {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`
}

function lineTypeLabel(lineType: DocketLineType) {
  const labels: Record<DocketLineType, string> = {
    product: 'Stock item',
    unavailable: 'Unavailable - not charged',
    charged_not_received: 'May need credit claim',
    deposit: 'Deposit - not stock',
    delivery_fee: 'Delivery fee - not stock',
    discount: 'Discount - not stock',
    credit: 'Credit - not stock',
    other_charge: 'Other charge - not stock',
  }

  return labels[lineType]
}

function chargedAmountForCredit(row: ReviewRow) {
  const total = Number(row.totalCost)
  const vatRate = Number(row.vatRatePercent)
  if (!Number.isFinite(total)) return null
  if (row.priceIncludesVat || !Number.isFinite(vatRate) || vatRate <= 0) return total
  return Math.round(total * (1 + vatRate / 100) * 100) / 100
}

export default function DeliveriesPage() {
  const [items, setItems] = useState<Item[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([])

  const [itemId, setItemId] = useState('')
  const [itemSearch, setItemSearch] = useState('')
  const [itemDropdownOpen, setItemDropdownOpen] = useState(false)

  const [deliveredAt, setDeliveredAt] = useState('')
  const [qty, setQty] = useState('')
  const [supplier, setSupplier] = useState('')
  const [totalCost, setTotalCost] = useState('')
  const [vatRatePercent, setVatRatePercent] = useState('0')
  const [vatReclaimStatus, setVatReclaimStatus] =
    useState<VatReclaimStatus>('NOT_APPLICABLE')
  const [batchCode, setBatchCode] = useState('')
  const [deliveryVehicleOk, setDeliveryVehicleOk] = useState(false)
  const [latestSupplierProduct, setLatestSupplierProduct] =
    useState<LatestSupplierProduct | null>(null)
  const [priceManuallyEdited, setPriceManuallyEdited] = useState(false)
  const [supplierManuallyEdited, setSupplierManuallyEdited] = useState(false)

  const [editingDeliveryId, setEditingDeliveryId] = useState<string | null>(null)
  const [editingDelivery, setEditingDelivery] = useState<EditingDelivery | null>(null)

  const [docketFiles, setDocketFiles] = useState<File[]>([])
  const [docketParsing, setDocketParsing] = useState(false)
  const [docketOcrProgress, setDocketOcrProgress] = useState('')
  const [docketSaving, setDocketSaving] = useState(false)
  const [addingReviewItemRowId, setAddingReviewItemRowId] = useState('')
  const [creditClaimSavingRowId, setCreditClaimSavingRowId] = useState('')
  const [parsedDocket, setParsedDocket] = useState<ParsedDocketResponse | null>(null)
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([])
  const [reviewSupplier, setReviewSupplier] = useState('')

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loadingPrice, setLoadingPrice] = useState(false)

  const itemPickerRef = useRef<HTMLDivElement | null>(null)
  const docketPhotoInputRef = useRef<HTMLInputElement | null>(null)
  const docketFileInputRef = useRef<HTMLInputElement | null>(null)
  const docketRedactionRefs = useRef<Record<string, ImageRedactionEditorHandle | null>>({})

  const selectedItem = items.find((item) => item.id === itemId)

  const supplierProductsByItemId = useMemo(() => {
    const map = new Map<string, SupplierProduct[]>()

    for (const product of supplierProducts) {
      if (!product.linkedItemId) continue

      const existing = map.get(product.linkedItemId) ?? []
      existing.push(product)
      map.set(product.linkedItemId, existing)
    }

    for (const item of items) {
      const bySku = supplierProducts.filter(
        (product) =>
          product.supplierSku &&
          product.supplierSku.toLowerCase() === item.sku.toLowerCase()
      )

      if (bySku.length > 0) {
        const existing = map.get(item.id) ?? []
        map.set(item.id, [...existing, ...bySku])
      }
    }

    for (const [key, value] of map.entries()) {
      const deduped = Array.from(new Map(value.map((product) => [product.id, product])).values())

      deduped.sort((a, b) => {
        const aPrice = a.unitPrice ?? Number.POSITIVE_INFINITY
        const bPrice = b.unitPrice ?? Number.POSITIVE_INFINITY
        return aPrice - bPrice
      })

      map.set(key, deduped)
    }

    return map
  }, [supplierProducts, items])

  const filteredItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase()

    if (!query) return items.slice(0, 50)

    return items
      .filter((item) => {
        const linkedProducts = supplierProductsByItemId.get(item.id) ?? []

        const supplierHaystack = linkedProducts
          .map((product) =>
            [
              product.supplier,
              product.supplierSku,
              product.name,
              product.packSize,
              product.weight,
            ]
              .filter(Boolean)
              .join(' ')
          )
          .join(' ')

        const haystack = `${item.name} ${item.sku} ${supplierHaystack}`.toLowerCase()

        return haystack.includes(query)
      })
      .slice(0, 50)
  }, [items, itemSearch, supplierProductsByItemId])

  const calculatedUnitCost =
    Number(qty) > 0 && Number(totalCost) > 0 ? Number(totalCost) / Number(qty) : null

  async function safeJson(res: Response) {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 1000))
    }
  }

  function todayInputValue() {
    return new Date().toISOString().slice(0, 10)
  }

  function formatDate(value: string | null) {
    if (!value) return ''
    return new Date(value).toLocaleDateString('en-GB')
  }

  function formatDateTime(value: string | null | undefined) {
    if (!value) return ''

    return new Date(value).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function enteredByLabel(delivery: Delivery) {
    const name = delivery.enteredByName || 'Unknown'
    const date = formatDateTime(delivery.createdAt)

    return date ? `${name} · ${date}` : name
  }

  function money(value: number | null | undefined, maximumFractionDigits = 2) {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits,
    }).format(value ?? 0)
  }

  function formatUnitPrice(value: number | null | undefined, unitType?: string) {
    if (value === null || value === undefined) return ''
    return `${money(value, 5)} / ${unitType || 'unit'}`
  }

  function effectiveSupplierUnitPrice(product: SupplierProduct, unitType: UnitType | '') {
    if (product.unitPrice !== null && Number.isFinite(product.unitPrice)) {
      if ((unitType === 'g' || unitType === 'ml') && product.unitPrice > 1) {
        return product.unitPrice / 1000
      }

      return product.unitPrice
    }

    if (product.packPrice === null || !Number.isFinite(product.packPrice)) return null

    const packText = `${product.packSize || ''} ${product.weight || ''}`
      .toLowerCase()
      .replace(/,/g, '.')
    const multiPack = packText.match(
      /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|gm?|g|ltr?|litre|ml)\b/
    )
    const singlePack = packText.match(
      /(\d+(?:\.\d+)?)\s*(kg|gm?|g|ltr?|litre|ml)\b/
    )
    const match = multiPack || singlePack

    if (!match) return unitType === 'each' ? product.packPrice : null

    const count = multiPack ? Number(match[1]) : 1
    const size = Number(match[multiPack ? 2 : 1])
    const measure = match[multiPack ? 3 : 2]
    const baseSize = ['kg', 'l', 'lt', 'ltr', 'litre'].includes(measure)
      ? size * 1000
      : size
    const measuredUnit = ['kg', 'g', 'gm'].includes(measure) ? 'g' : 'ml'

    if (measuredUnit !== unitType || !Number.isFinite(baseSize) || baseSize <= 0) return null

    return product.packPrice / (count * baseSize)
  }

  function supplierProductForReviewRow(row: ReviewRow) {
    if (row.matchedSupplierProductId) {
      const exact = supplierProducts.find(
        (product) => product.id === row.matchedSupplierProductId
      )
      if (exact) return exact
    }

    const supplier = row.supplier.trim().toLowerCase()
    const supplierSku = row.supplierSku.trim().toLowerCase()

    if (supplierSku && supplier) {
      const exactSupplierSku = supplierProducts.find(
        (product) =>
          product.supplierSku?.toLowerCase() === supplierSku &&
          product.supplier.toLowerCase() === supplier
      )
      if (exactSupplierSku) return exactSupplierSku
    }

    if (supplierSku) {
      const skuMatch = supplierProducts.find(
        (product) => product.supplierSku?.toLowerCase() === supplierSku
      )
      if (skuMatch) return skuMatch
    }

    if (row.selectedItemId) {
      const linkedProducts = supplierProductsByItemId.get(row.selectedItemId) ?? []
      if (supplier) {
        const supplierMatch = linkedProducts.find(
          (product) => product.supplier.toLowerCase() === supplier
        )
        if (supplierMatch) return supplierMatch
      }

      return linkedProducts[0] ?? null
    }

    return null
  }

  function priceCheckForReviewRow(row: ReviewRow) {
    const product = supplierProductForReviewRow(row)
    const qtyNumber = Number(row.qty)
    const actualTotal = Number(row.totalCost)

    if (!product || !Number.isFinite(actualTotal) || actualTotal <= 0) {
      return null
    }

    let expectedTotal: number | null = null
    let basis = ''

    const effectiveUnitPrice = effectiveSupplierUnitPrice(product, row.unitType)

    if (effectiveUnitPrice !== null && Number.isFinite(qtyNumber) && qtyNumber > 0) {
      expectedTotal = effectiveUnitPrice * qtyNumber
      basis = `${money(effectiveUnitPrice, 5)} / ${row.unitType || 'unit'}`
    } else if (
      product.packPrice !== null &&
      product.packPrice !== undefined &&
      Number.isFinite(product.packPrice)
    ) {
      expectedTotal =
        row.unitType === 'each' && Number.isFinite(qtyNumber) && qtyNumber > 0
          ? product.packPrice * qtyNumber
          : product.packPrice
      basis =
        row.unitType === 'each' && Number.isFinite(qtyNumber) && qtyNumber > 0
          ? `${money(product.packPrice, 2)} pack x ${qtyNumber}`
          : `${money(product.packPrice, 2)} pack`
    }

    if (expectedTotal === null || expectedTotal <= 0) {
      return null
    }

    const difference = actualTotal - expectedTotal
    const tolerance = Math.max(0.1, expectedTotal * 0.02)
    const percent = (difference / expectedTotal) * 100
    const hasIncrease = difference > tolerance
    const hasDecrease = difference < -tolerance

    return {
      product,
      expectedTotal,
      difference,
      percent,
      basis,
      hasWarning: hasIncrease,
      hasIncrease,
      hasDecrease,
    }
  }

  function toInputValue(value: string | number | null | undefined) {
    if (value === null || value === undefined) return ''
    return String(value)
  }

  function packSummary(product: SupplierProduct | LatestSupplierProduct | null | undefined) {
    if (!product) return 'No linked supplier pack saved'

    const parts = [
      product.supplier,
      product.supplierSku ? `SKU ${product.supplierSku}` : null,
      product.packSize ? `Pack ${product.packSize}` : null,
      product.weight ? `Weight ${product.weight}` : null,
      product.packPrice !== null && product.packPrice !== undefined
        ? `Pack price ${money(product.packPrice, 2)}`
        : null,
      product.unitPrice !== null && product.unitPrice !== undefined
        ? `Unit ${money(product.unitPrice, 5)}`
        : null,
    ].filter(Boolean)

    return parts.join(' · ')
  }

  function bestSupplierProductForItem(item: Item) {
    const products = supplierProductsByItemId.get(item.id) ?? []
    return products[0] ?? null
  }

  async function loadData() {
    try {
      setError('')

      const [itemsRes, deliveriesRes, supplierProductsRes] = await Promise.all([
        fetch('/api/items', { cache: 'no-store' }),
        fetch('/api/deliveries', { cache: 'no-store' }),
        fetch('/api/supplier-products', { cache: 'no-store' }),
      ])

      const itemsData = await safeJson(itemsRes)
      const deliveriesData = await safeJson(deliveriesRes)
      const supplierProductsData = await safeJson(supplierProductsRes)

      if (!itemsRes.ok) throw new Error(itemsData?.error || 'Failed to load items')
      if (!deliveriesRes.ok) throw new Error(deliveriesData?.error || 'Failed to load deliveries')
      if (!supplierProductsRes.ok) {
        throw new Error(supplierProductsData?.error || 'Failed to load supplier products')
      }

      setItems(itemsData.filter((item: Item) => item.itemType === 'L3'))
      setDeliveries(deliveriesData)
      setSupplierProducts(supplierProductsData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    setDeliveredAt(todayInputValue())
    loadData()
  }, [])

  useEffect(() => {
    if (deliveries.length === 0 || !window.location.hash.startsWith('#delivery-')) return

    window.setTimeout(() => {
      document.querySelector(window.location.hash)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 50)
  }, [deliveries])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!itemPickerRef.current) return

      if (!itemPickerRef.current.contains(event.target as Node)) {
        setItemDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!latestSupplierProduct?.unitPrice) return
    if (priceManuallyEdited) return
    if (!qty || Number(qty) <= 0) return

    const calculated = latestSupplierProduct.unitPrice * Number(qty)
    setTotalCost(calculated.toFixed(2))
  }, [qty, latestSupplierProduct?.unitPrice, priceManuallyEdited])

  async function loadLatestSupplierPrice(nextItemId: string) {
    try {
      setLoadingPrice(true)
      setLatestSupplierProduct(null)

      const res = await fetch(`/api/supplier-products/latest?itemId=${nextItemId}`, {
        cache: 'no-store',
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load latest supplier price')
      }

      const product = data.supplierProduct as LatestSupplierProduct | null
      setLatestSupplierProduct(product)

      if (product) {
        if (!supplierManuallyEdited) {
          setSupplier(product.supplier)
        }

        if (!priceManuallyEdited && qty && Number(qty) > 0 && product.unitPrice) {
          setTotalCost((Number(qty) * product.unitPrice).toFixed(2))
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoadingPrice(false)
    }
  }

  function selectItem(item: Item) {
    setItemId(item.id)
    setItemSearch(`${item.name} [${item.sku}]`)
    setItemDropdownOpen(false)
    setPriceManuallyEdited(false)
    setSupplierManuallyEdited(false)
    loadLatestSupplierPrice(item.id)
  }

  function clearSelectedItem() {
    setItemId('')
    setItemSearch('')
    setItemDropdownOpen(false)
    setLatestSupplierProduct(null)
    setSupplier('')
    setTotalCost('')
    setPriceManuallyEdited(false)
    setSupplierManuallyEdited(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    try {
      setError('')
      setMessage('')

      if (!itemId) {
        throw new Error('Select an L3 item.')
      }

      const res = await fetch('/api/deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          deliveredAt,
          qty: Number(qty),
          supplier,
          totalCost: Number(totalCost),
          vatRatePercent: Number(vatRatePercent),
          vatReclaimStatus,
          deliveryVehicleOk,
          batchCode,
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save delivery')
      }

      setItemId('')
      setItemSearch('')
      setDeliveredAt(todayInputValue())
      setQty('')
      setSupplier('')
      setTotalCost('')
      setVatRatePercent('0')
      setVatReclaimStatus('NOT_APPLICABLE')
      setDeliveryVehicleOk(false)
      setBatchCode('')
      setLatestSupplierProduct(null)
      setPriceManuallyEdited(false)
      setSupplierManuallyEdited(false)
      setMessage('Delivery saved.')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  function startEditDelivery(delivery: Delivery) {
    setEditingDeliveryId(delivery.id)
    setEditingDelivery({
      deliveredAt: toDateInputValue(delivery.deliveredAt),
      qty: String(delivery.qty),
      supplier: delivery.supplier ?? '',
      totalCost: toInputValue(delivery.price),
      expiryAt: toDateInputValue(delivery.expiryAt),
      vatRatePercent: String(delivery.vatRatePercent || 0),
      vatReclaimStatus: delivery.vatReclaimStatus,
      deliveryVehicleOk: delivery.deliveryVehicleOk,
    })
    setError('')
    setMessage('')
  }

  function cancelEditDelivery() {
    setEditingDeliveryId(null)
    setEditingDelivery(null)
  }

  async function saveDeliveryEdit(delivery: Delivery) {
    if (!editingDelivery) return

    try {
      setError('')
      setMessage('')

      const res = await fetch('/api/deliveries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: delivery.id,
          deliveredAt: editingDelivery.deliveredAt,
          qty: Number(editingDelivery.qty),
          supplier: editingDelivery.supplier,
          totalCost: Number(editingDelivery.totalCost),
          expiryAt: editingDelivery.expiryAt || null,
          vatRatePercent: Number(editingDelivery.vatRatePercent),
          vatReclaimStatus: editingDelivery.vatReclaimStatus,
          deliveryVehicleOk: editingDelivery.deliveryVehicleOk,
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to update delivery')
      }

      setMessage('Delivery updated.')
      cancelEditDelivery()
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  async function handleDelete(id: string, label: string) {
    setError('')
    setMessage('')

    const confirmed = window.confirm(`Delete delivery: ${label}?`)
    if (!confirmed) return

    const res = await fetch(`/api/deliveries?id=${id}`, {
      method: 'DELETE',
    })

    const data = await safeJson(res)

    if (!res.ok) {
      setError(data?.error || 'Failed to delete delivery')
      return
    }

    setMessage('Delivery deleted.')
    await loadData()
  }

  function filteredReviewItems(searchValue: string) {
    const query = searchValue.trim().toLowerCase()

    if (!query) return items.slice(0, 25)

    return items
      .filter((item) => {
        const haystack = `${item.name} ${item.sku}`.toLowerCase()
        return haystack.includes(query)
      })
      .slice(0, 25)
  }

  function updateReviewRow(rowId: string, updates: Partial<ReviewRow>) {
    setReviewRows((rows) =>
      rows.map((row) => {
        if (row.rowId !== rowId) return row
        return { ...row, ...updates }
      })
    )
  }

  function identityConfidenceForReviewRow(row: ReviewRow) {
    const sku = comparableSku(row.supplierSku)
    const supplier = row.supplier.trim()
    const skuMatches = sku
      ? supplierProducts.filter((product) => comparableSku(product.supplierSku) === sku)
      : []
    const supplierMatches = supplier
      ? supplierProducts.filter((product) => supplierNamesMatch(product.supplier, supplier))
      : []
    const exact = skuMatches.find((product) => supplierNamesMatch(product.supplier, supplier))

    if (exact) {
      return {
        confidence: 1,
        reason: row.supplierInferredFromSku
          ? 'Exact SKU; supplier inferred from saved product'
          : 'Exact SKU + supplier match',
      }
    }

    if (skuMatches.length > 0 && !supplier) {
      return {
        confidence: 0.5,
        reason:
          skuMatches.length === 1
            ? 'SKU matched; supplier not confirmed'
            : 'SKU matches multiple suppliers',
      }
    }

    if (supplierMatches.length > 0) {
      return {
        confidence: 0.5,
        reason: sku ? 'Supplier matched; SKU did not' : 'Supplier matched; SKU missing',
      }
    }

    if (skuMatches.length > 0) {
      return { confidence: 0.5, reason: 'SKU matched; supplier did not' }
    }

    return { confidence: 0, reason: 'SKU and supplier not matched' }
  }

  function reconcileReviewRowIdentity(
    row: ReviewRow,
    nextSupplier: string,
    nextSupplierSku = row.supplierSku
  ): ReviewRow {
    const sku = comparableSku(nextSupplierSku)
    const exact = supplierProducts.find(
      (product) =>
        sku &&
        comparableSku(product.supplierSku) === sku &&
        supplierNamesMatch(product.supplier, nextSupplier)
    )
    const linkedItem = exact?.linkedItemId
      ? items.find((item) => item.id === exact.linkedItemId)
      : null
    const clearPreviousAutomaticMatch = Boolean(row.matchedSupplierProductId && !exact)

    return {
      ...row,
      supplier: nextSupplier,
      supplierSku: nextSupplierSku,
      supplierInferredFromSku: false,
      matchedSupplierProductId: exact?.id ?? null,
      selectedItemId: linkedItem?.id ?? (clearPreviousAutomaticMatch ? '' : row.selectedItemId),
      itemSearch: linkedItem
        ? `${linkedItem.name} [${linkedItem.sku}]`
        : clearPreviousAutomaticMatch
          ? ''
          : row.itemSearch,
      unitType: linkedItem?.unitType ?? row.unitType,
    }
  }

  function applyReviewSupplierToAllRows() {
    const nextSupplier = reviewSupplier.trim()
    setReviewRows((rows) =>
      rows.map((row) => reconcileReviewRowIdentity(row, nextSupplier))
    )
  }

  function chooseDocketFiles(fileList: FileList | null, appendPhotos = false) {
    const incoming = Array.from(fileList || [])
    if (incoming.length === 0) return

    const allIncomingImages = incoming.every((file) => file.type.startsWith('image/'))
    const canAppend =
      appendPhotos &&
      allIncomingImages &&
      docketFiles.every((file) => file.type.startsWith('image/'))
    const nextFiles = canAppend ? [...docketFiles, ...incoming] : incoming

    if (nextFiles.length > 3) {
      setError('Use up to 3 photos for one docket, or combine additional pages into a PDF.')
      return
    }

    if (nextFiles.length > 1 && !nextFiles.every((file) => file.type.startsWith('image/'))) {
      setError('Choose one document file or up to 3 photos of the same docket.')
      return
    }

    docketRedactionRefs.current = {}
    setDocketFiles(nextFiles)
    setParsedDocket(null)
    setReviewRows([])
    setReviewSupplier('')
    setError('')
    setMessage('')
  }

  function selectReviewItem(rowId: string, item: Item) {
    updateReviewRow(rowId, {
      selectedItemId: item.id,
      itemSearch: `${item.name} [${item.sku}]`,
      unitType: item.unitType,
      dropdownOpen: false,
      matchedSupplierProductId: null,
      supplierInferredFromSku: false,
    })
  }

  function clearReviewItem(rowId: string) {
    updateReviewRow(rowId, {
      selectedItemId: '',
      itemSearch: '',
      dropdownOpen: false,
      matchedSupplierProductId: null,
    })
  }

  async function addReviewRowAsNewItem(row: ReviewRow) {
    try {
      setError('')

      if (!row.supplier.trim()) {
        throw new Error('Enter the supplier before adding this product as a new L3 item.')
      }

      if (!row.productName.trim()) {
        throw new Error('Enter the docket product name before adding a new L3 item.')
      }

      if (!row.unitType) {
        throw new Error('Choose the product unit before adding a new L3 item.')
      }

      if (row.supplierSku.trim() && row.skuConfidence < 0.75) {
        throw new Error('Correct the cropped supplier SKU, or clear it before adding a new L3 item.')
      }

      setAddingReviewItemRowId(row.rowId)
      const qty = Number(row.qty)
      const totalCost = Number(row.totalCost)
      const unitPrice =
        Number.isFinite(qty) && qty > 0 && Number.isFinite(totalCost) && totalCost >= 0
          ? totalCost / qty
          : null
      const res = await fetch('/api/supplier-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier: row.supplier.trim(),
          fileName: docketFiles.map((file) => file.name).join(', ') || 'Delivery docket review',
          createLinkedL3: true,
          returnSavedProducts: true,
          products: [
            {
              supplier: row.supplier.trim(),
              supplierSku: row.supplierSku.trim() || null,
              name: row.productName.trim(),
              unitType: row.unitType,
              packSize: row.packSize || null,
              weight: row.packSize || null,
              packPrice: row.packPrice ? Number(row.packPrice) : null,
              unitPrice,
            },
          ],
        }),
      })
      const data = await safeJson(res)

      if (!res.ok) throw new Error(data?.error || 'Failed to add the new L3 item.')

      const savedProduct = (data.savedProducts || [])[0] as SupplierProduct | undefined
      const linkedItem = savedProduct?.linkedItem

      if (!savedProduct || !linkedItem) {
        throw new Error('The supplier product was saved but could not be linked to an L3 item.')
      }

      setSupplierProducts((current) => [
        savedProduct,
        ...current.filter((product) => product.id !== savedProduct.id),
      ])
      setItems((current) => [
        linkedItem,
        ...current.filter((item) => item.id !== linkedItem.id),
      ])
      updateReviewRow(row.rowId, {
        selectedItemId: linkedItem.id,
        itemSearch: `${linkedItem.name} [${linkedItem.sku}]`,
        unitType: linkedItem.unitType,
        dropdownOpen: false,
        matchedSupplierProductId: savedProduct.id,
        supplierInferredFromSku: false,
      })
      setMessage(`${linkedItem.name} added as a new L3 item and linked to this supplier.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add the new L3 item.')
    } finally {
      setAddingReviewItemRowId('')
    }
  }

  async function parseDocket() {
    try {
      setError('')
      setMessage('')
      setParsedDocket(null)
      setReviewRows([])
      setReviewSupplier('')

      if (docketFiles.length === 0) {
        throw new Error('Choose a delivery docket file first.')
      }

      setDocketParsing(true)

      const isImage = docketFiles.every((file) => file.type.startsWith('image/'))
      if (docketFiles.length > 1 && !isImage) {
        throw new Error('Upload one document file or up to 3 photos of the same docket.')
      }
      const directUploadLimit = 4 * 1024 * 1024
      let res: Response
      let data: ParsedDocketResponse & { error?: string }
      const parserRequestId = crypto.randomUUID()

      const processOnce = async (request: RequestInit) => {
        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), 100_000)

        try {
          return await fetch('/api/parse-delivery-docket', {
            ...request,
            headers: {
              ...request.headers,
              'X-Flowdish-Request-Id': parserRequestId,
            },
            signal: controller.signal,
          })
        } catch (error) {
          if (controller.signal.aborted) {
            throw new Error(
              `Flowdish stopped this request after 100 seconds. Reference: ${parserRequestId}`
            )
          }

          throw error
        } finally {
          window.clearTimeout(timeout)
        }
      }

      const processWithRetry = async (request: RequestInit) => {
        try {
          return await processOnce(request)
        } catch (error) {
          if (error instanceof Error && error.message.includes('after 100 seconds')) {
            throw error
          }

          setDocketOcrProgress('Connection interrupted. Retrying once...')
          await new Promise((resolve) => window.setTimeout(resolve, 900))

          try {
            return await processOnce(request)
          } catch (retryError) {
            if (
              retryError instanceof Error &&
              retryError.message.includes('after 100 seconds')
            ) {
              throw retryError
            }

            throw new Error(
              `The connection was interrupted while processing the docket. Reference: ${parserRequestId}`
            )
          }
        }
      }

      if (isImage) {
        setDocketOcrProgress(
          `Preparing ${docketFiles.length === 1 ? 'the selected docket area' : `${docketFiles.length} selected pages`}...`
        )
        const maxImageBytes = docketFiles.length > 1 ? 900 * 1024 : undefined
        const redactedImages = await Promise.all(
          docketFiles.map(async (file, index) => {
            const editor = docketRedactionRefs.current[docketFileKey(file, index)]
            const redacted = await editor?.exportRedactedImage(maxImageBytes)
            if (!redacted) throw new Error(`Review the selected area for page ${index + 1}.`)
            return redacted.dataUrl
          })
        )

        setDocketOcrProgress('AI is reading the selected docket area...')

        res = await processWithRetry({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            redactedImageDataUrls: redactedImages,
            privacySelectionConfirmed: true,
            sourceFileNames: docketFiles.map((file) => file.name),
          }),
        })
        data = (await safeJson(res)) as ParsedDocketResponse & { error?: string }
      } else {
        const docketFile = docketFiles[0]
        if (docketFile.size > directUploadLimit) {
          throw new Error(
            'This file is too large to upload directly. Use a smaller text-based file or take a photo so OCR can run before upload.'
          )
        }

        const formData = new FormData()
        formData.append('file', docketFile)

        res = await processWithRetry({
          method: 'POST',
          body: formData,
        })
        data = (await safeJson(res)) as ParsedDocketResponse & { error?: string }
      }

      if (!res.ok) {
        const responseRequestId = res.headers.get('X-Flowdish-Request-Id')
        throw new Error(
          `${data?.error || 'Failed to process delivery docket.'} Reference: ${responseRequestId || parserRequestId}`
        )
      }

      const mappedRows: ReviewRow[] = (data.rows || []).map((row, index) => {
        const matchedItem = row.matchedItemId
          ? items.find((item) => item.id === row.matchedItemId)
          : null

        return {
          rowId: `${Date.now()}-${index}`,
          include: row.lineType === 'product',
          chargedNotReceived: false,
          creditClaimRecorded: false,
          supplier: row.supplier || data.supplier || '',
          supplierSku: row.supplierSku || '',
          productName: row.productName || '',
          lineType: row.lineType || 'product',
          packSize: row.packSize || '',
          packPrice: toInputValue(row.packPrice),
          qty: toInputValue(row.qty),
          unitType: row.matchedItemUnitType || row.unitType || matchedItem?.unitType || '',
          totalCost: toInputValue(row.lineTotal ?? row.packPrice),
          priceIncludesVat: row.lineTotalIncludesVat === true,
          batchCode: row.batchCode || '',
          expiryDate: row.expiryDate || '',
          vatCode: row.vatCode || '',
          vatRatePercent: toInputValue(row.vatRatePercent ?? 0),
          vatReclaimStatus:
            Number(row.vatRatePercent) > 0 ? 'ELIGIBLE' : 'NOT_APPLICABLE',
          deliveryVehicleOk: false,
          selectedItemId: row.matchedItemId || '',
          itemSearch:
            row.matchedItemName && row.matchedItemSku
              ? `${row.matchedItemName} [${row.matchedItemSku}]`
              : '',
          dropdownOpen: false,
          quantityConfidence:
            row.quantityConfidence ?? (row.qty && row.unitType ? 0.8 : 0),
          quantityReason:
            row.quantityReason ||
            (row.qty && row.unitType ? 'Quantity and unit were extracted.' : 'Review quantity.'),
          skuConfidence: row.skuConfidence ?? (row.supplierSku ? 0.8 : 0),
          skuReason:
            row.skuReason ||
            (row.supplierSku ? 'SKU was extracted from the docket.' : 'No SKU was visible.'),
          supplierInferredFromSku: Boolean(row.supplierInferredFromSku),
          notes: row.notes || '',
          needsReview: Boolean(row.needsReview),
          matchedSupplierProductId: row.matchedSupplierProductId,
        }
      })

      setParsedDocket(data)
      setReviewRows(mappedRows)
      setReviewSupplier(mappedRows[0]?.supplier || data.supplier || '')

      if (data.deliveryDate) {
        setDeliveredAt(data.deliveryDate)
      }

      setMessage(
        `Docket processed. ${mappedRows.length} row(s) found. Review before saving to inventory.`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setDocketParsing(false)
      setDocketOcrProgress('')
    }
  }

  async function saveReviewedDocketRows() {
    try {
      setError('')
      setMessage('')
      setDocketSaving(true)

      const rowsToSave = reviewRows.filter((row) => row.include)
      const rowsToClaim = reviewRows.filter(
        (row) => row.chargedNotReceived && !row.creditClaimRecorded
      )

      if (rowsToSave.length === 0 && rowsToClaim.length === 0) {
        throw new Error('No rows selected to save or record as charged but not received.')
      }

      const invalidRows = rowsToSave.filter((row) => {
        return (
          !row.selectedItemId ||
          !row.qty ||
          Number(row.qty) <= 0 ||
          !row.totalCost ||
          Number(row.totalCost) < 0
        )
      })

      if (invalidRows.length > 0) {
        throw new Error(
          `${invalidRows.length} selected row(s) are missing L3 item, quantity, or total cost.`
        )
      }

      let savedCount = 0
      let claimedCount = 0

      for (const row of rowsToSave) {
        const res = await fetch('/api/deliveries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId: row.selectedItemId,
            deliveredAt,
            qty: Number(row.qty),
            supplier: row.supplier,
            totalCost: Number(row.totalCost),
            vatRatePercent: Number(row.vatRatePercent),
            vatReclaimStatus: row.vatReclaimStatus,
            priceIncludesVat: row.priceIncludesVat,
            deliveryVehicleOk: row.deliveryVehicleOk,
            batchCode: row.batchCode,
            expiryAt: row.expiryDate || null,
          }),
        })

        const data = await safeJson(res)

        if (!res.ok) {
          throw new Error(
            data?.error ||
              `Failed to save delivery row: ${row.productName || row.itemSearch || row.supplierSku}`
          )
        }

        savedCount++
      }

      for (const row of rowsToClaim) {
        await recordChargedNotReceived(row)
        claimedCount++
      }

      setMessage(
        `${savedCount} delivery row(s) saved and inventory increased.${
          claimedCount > 0
            ? ` ${claimedCount} charged-but-not-received claim(s) recorded.`
            : ''
        }`
      )
      setParsedDocket(null)
      setReviewRows([])
      setReviewSupplier('')
      setDocketFiles([])
      docketRedactionRefs.current = {}
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setDocketSaving(false)
      setCreditClaimSavingRowId('')
    }
  }

  async function recordChargedNotReceived(row: ReviewRow) {
    setCreditClaimSavingRowId(row.rowId)

    const res = await fetch('/api/supplier-credit-claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier: row.supplier || reviewSupplier,
        supplierSku: row.supplierSku,
        productName: row.productName || row.itemSearch || row.supplierSku,
        qty: row.qty,
        unitType: row.unitType || null,
        chargedAmount: chargedAmountForCredit(row),
        docketNumber: parsedDocket?.docketNumber,
        chargedAt: deliveredAt || parsedDocket?.deliveryDate,
        notes: row.notes,
      }),
    })
    const data = await safeJson(res)

    if (!res.ok) {
      throw new Error(data?.error || 'Failed to record supplier credit claim')
    }

    updateReviewRow(row.rowId, {
      include: false,
      chargedNotReceived: false,
      creditClaimRecorded: true,
    })
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-semibold text-slate-900">Deliveries</h1>

        {error ? (
          <CopyableError message={error} className="mt-4" />
        ) : null}

        {message ? (
          <div className="sticky top-4 z-40 mt-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700 shadow-sm">
            {message}
          </div>
        ) : null}

        <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Upload Delivery Docket</h2>
          <p className="mt-2 text-sm text-slate-700">
            Take up to 3 photos or upload a PDF, Excel, TXT, or CSV docket. Review every row
            before saving.
          </p>
          <details className="mt-2 text-sm text-slate-600">
            <summary className="cursor-pointer font-medium text-teal-800">What to include</summary>
            <p className="mt-2 max-w-3xl">
              Select the product table, VAT legend, docket date and docket number. Use separate
              selection boxes for the supplier name if needed, and leave addresses or account
              details unselected.
            </p>
          </details>

          <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Selected docket
              </label>
              <input
                ref={docketPhotoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={(e) => {
                  chooseDocketFiles(e.target.files, true)
                  e.target.value = ''
                }}
                className="hidden"
              />
              <input
                ref={docketFileInputRef}
                type="file"
                accept="image/*,.pdf,.txt,.csv,.xlsx,.xls"
                multiple
                onChange={(e) => {
                  chooseDocketFiles(e.target.files)
                  e.target.value = ''
                }}
                className="hidden"
              />
              <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {docketFiles.length
                  ? docketFiles.map((file) => file.name).join(', ')
                  : 'No docket selected'}
              </div>
              {docketOcrProgress ? (
                <div className="mt-2 text-sm text-slate-600">{docketOcrProgress}</div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => docketPhotoInputRef.current?.click()}
              disabled={docketParsing || docketSaving}
              className="rounded-xl border px-5 py-3 text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              {docketFiles.length > 0 && docketFiles.every((file) => file.type.startsWith('image/'))
                ? 'Add Photo'
                : 'Take Photo'}
            </button>

            <button
              type="button"
              onClick={() => docketFileInputRef.current?.click()}
              disabled={docketParsing || docketSaving}
              className="rounded-xl border px-5 py-3 text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Upload File / Photos
            </button>

            {docketFiles.length > 0 && !docketFiles.every((file) => file.type.startsWith('image/')) ? (
              <button
                type="button"
                onClick={parseDocket}
                disabled={docketParsing || docketSaving}
                className="rounded-xl bg-slate-900 px-5 py-3 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {docketParsing ? 'Processing...' : 'Process Docket'}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setDocketFiles([])
                docketRedactionRefs.current = {}
                setParsedDocket(null)
                setReviewRows([])
                setReviewSupplier('')
              }}
              disabled={docketParsing || docketSaving}
              className="rounded-xl border px-5 py-3 text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Clear
            </button>
          </div>

          {docketFiles.every((file) => file.type.startsWith('image/'))
            ? docketFiles.map((file, index) => {
                const key = docketFileKey(file, index)
                return (
                  <ImageRedactionEditor
                    key={key}
                    ref={(handle) => {
                      docketRedactionRefs.current[key] = handle
                    }}
                    file={file}
                    kind="delivery"
                    pageLabel={docketFiles.length > 1 ? `Page ${index + 1}` : undefined}
                    disabled={docketParsing || docketSaving}
                    onProcess={index === docketFiles.length - 1 ? parseDocket : undefined}
                    processing={docketParsing}
                  />
                )
              })
            : null}
        </section>

        {parsedDocket ? (
          <section className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-xl font-semibold text-slate-900">Docket Review</h2>
              <div className="mt-1 text-sm text-slate-700">
                Supplier: {parsedDocket.supplier || 'Unknown'} · Date:{' '}
                {parsedDocket.deliveryDate || deliveredAt || 'Unknown'} · Docket:{' '}
                {parsedDocket.docketNumber || 'N/A'} · Rows: {reviewRows.length}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <div
                  className={`rounded-md border px-3 py-2 font-medium ${
                    parsedDocket.totals.matches === false
                      ? 'border-amber-300 bg-amber-50 text-amber-900'
                      : parsedDocket.totals.matches === true
                        ? 'border-green-300 bg-green-50 text-green-800'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  {parsedDocket.totals.matches === false
                    ? 'Totals need review'
                    : parsedDocket.totals.matches === true
                      ? 'Docket total checked'
                      : 'Docket total not visible'}
                </div>
                <details className="text-slate-600">
                  <summary className="cursor-pointer font-medium text-teal-800">
                    View totals
                  </summary>
                  <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1 rounded-md border bg-slate-50 p-3 text-xs">
                    <span>Extracted lines</span>
                    <span>{money(parsedDocket.totals.extractedLineTotal, 2)}</span>
                    <span>Goods total</span>
                    <span>
                      {parsedDocket.totals.goodsTotal === null
                        ? 'Not visible'
                        : money(parsedDocket.totals.goodsTotal, 2)}
                    </span>
                    <span>VAT total</span>
                    <span>
                      {parsedDocket.totals.vatTotal === null
                        ? 'Not visible'
                        : money(parsedDocket.totals.vatTotal, 2)}
                    </span>
                    <span>Amount payable</span>
                    <span>
                      {parsedDocket.totals.grandTotal === null
                        ? 'Not visible'
                        : money(parsedDocket.totals.grandTotal, 2)}
                    </span>
                    {parsedDocket.totals.difference !== null ? (
                      <>
                        <span>Difference</span>
                        <span>{money(parsedDocket.totals.difference, 2)}</span>
                      </>
                    ) : null}
                  </div>
                </details>
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,240px)_minmax(0,420px)]">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-900">
                    Delivery date for saved rows
                  </label>
                  <input
                    type="date"
                    value={deliveredAt}
                    onChange={(e) => setDeliveredAt(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-900">
                    Supplier for this docket
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={reviewSupplier}
                      onChange={(e) => setReviewSupplier(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2"
                      placeholder="Correct supplier name..."
                    />
                    <button
                      type="button"
                      onClick={applyReviewSupplierToAllRows}
                      disabled={reviewRows.length === 0}
                      className="whitespace-nowrap rounded-xl border px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                      Apply to all rows
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Use this if the AI picked the wrong supplier for the whole docket.
                  </p>
                </div>
              </div>
            </div>

            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-[2320px] w-full text-left">
                <thead className="bg-slate-100 text-sm">
                  <tr>
                    <th className="px-4 py-3 text-slate-800">Save</th>
                    <th className="px-4 py-3 text-slate-800">
                      <label className="flex min-w-36 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={
                            reviewRows.length > 0 &&
                            reviewRows.every((row) => row.deliveryVehicleOk)
                          }
                          onChange={(event) =>
                            setReviewRows((rows) =>
                              rows.map((row) => ({
                                ...row,
                                deliveryVehicleOk: event.target.checked,
                              }))
                            )
                          }
                          aria-label="Set delivery vehicle OK for all rows"
                        />
                        <span>Delivery Vehicle OK</span>
                      </label>
                    </th>
                    <th className="px-4 py-3 text-slate-800">Supplier</th>
                    <th className="px-4 py-3 text-slate-800">Supplier SKU</th>
                    <th className="px-4 py-3 text-slate-800">Docket Product</th>
                    <th className="px-4 py-3 text-slate-800">Matched L3</th>
                    <th className="px-4 py-3 text-slate-800">Traceability</th>
                    <th className="px-4 py-3 text-slate-800">Qty</th>
                    <th className="px-4 py-3 text-slate-800">Unit</th>
                    <th className="px-4 py-3 text-slate-800">Total Cost</th>
                    <th className="px-4 py-3 text-slate-800">Price Check</th>
                    <th className="px-4 py-3 text-slate-800">VAT</th>
                    <th className="px-4 py-3 text-slate-800">Identity Confidence</th>
                    <th className="px-4 py-3 text-slate-800">Notes</th>
                  </tr>
                </thead>

                <tbody>
                  {reviewRows.map((row) => {
                    const selectedReviewItem = items.find(
                      (item) => item.id === row.selectedItemId
                    )
                    const dropdownItems = filteredReviewItems(row.itemSearch)
                    const priceCheck = priceCheckForReviewRow(row)
                    const identityMatch = identityConfidenceForReviewRow(row)
                    const rowNeedsReview =
                      row.lineType === 'product' &&
                      (!selectedReviewItem ||
                        !row.qty ||
                        !row.unitType ||
                        identityMatch.confidence < 1 ||
                        row.quantityConfidence < 0.75 ||
                        Boolean(priceCheck?.hasWarning))

                    return (
                      <tr
                        key={row.rowId}
                        className={`border-t align-top ${
                          rowNeedsReview
                            ? 'bg-amber-50'
                            : row.lineType !== 'product'
                              ? 'bg-slate-50'
                              : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex min-w-40 flex-col items-start gap-2">
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={row.include}
                                disabled={row.creditClaimRecorded}
                                onChange={(e) =>
                                  updateReviewRow(row.rowId, {
                                    include: e.target.checked,
                                    chargedNotReceived: e.target.checked
                                      ? false
                                      : row.chargedNotReceived,
                                  })
                                }
                              />
                              Save
                            </label>
                            <label className="flex items-start gap-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={row.chargedNotReceived || row.creditClaimRecorded}
                                disabled={
                                  row.creditClaimRecorded ||
                                  creditClaimSavingRowId === row.rowId
                                }
                                onChange={(e) =>
                                  updateReviewRow(row.rowId, {
                                    chargedNotReceived: e.target.checked,
                                    include: e.target.checked ? false : row.include,
                                  })
                                }
                              />
                              <span>
                                {row.creditClaimRecorded
                                  ? 'Credit claim recorded'
                                  : creditClaimSavingRowId === row.rowId
                                    ? 'Recording...'
                                    : 'Charged, not received'}
                              </span>
                            </label>
                            {row.lineType !== 'product' ? (
                              <div className="max-w-40 text-xs font-medium text-slate-600">
                                {lineTypeLabel(row.lineType)}
                              </div>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <label className="flex min-w-32 items-start gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={row.deliveryVehicleOk}
                              onChange={(e) =>
                                updateReviewRow(row.rowId, {
                                  deliveryVehicleOk: e.target.checked,
                                })
                              }
                              className="mt-0.5 h-4 w-4"
                            />
                            <span>Cleanliness checked</span>
                          </label>
                        </td>

                        <td className="px-4 py-3">
                          <input
                            value={row.supplier}
                            onChange={(e) =>
                              setReviewRows((rows) =>
                                rows.map((current) =>
                                  current.rowId === row.rowId
                                    ? reconcileReviewRowIdentity(current, e.target.value)
                                    : current
                                )
                              )
                            }
                            className="w-32 rounded-lg border px-2 py-1 text-sm"
                          />
                        </td>

                        <td className="px-4 py-3">
                          <input
                            value={row.supplierSku}
                            onChange={(e) =>
                              setReviewRows((rows) =>
                                rows.map((current) =>
                                  current.rowId === row.rowId
                                    ? {
                                        ...reconcileReviewRowIdentity(
                                          current,
                                          current.supplier,
                                          e.target.value
                                        ),
                                        skuConfidence: e.target.value.trim() ? 1 : 0,
                                        skuReason: e.target.value.trim()
                                          ? 'SKU reviewed by user.'
                                          : 'No SKU entered.',
                                      }
                                    : current
                                )
                              )
                            }
                            className="w-32 rounded-lg border px-2 py-1 text-sm"
                          />
                          {identityMatch.confidence < 1 ? (
                            <div className="mt-1 text-xs font-medium text-amber-800">
                              {identityMatch.reason}
                            </div>
                          ) : null}
                          {row.supplierSku && row.skuConfidence < 0.75 ? (
                            <div className="mt-1 w-36 text-xs font-medium text-amber-800">
                              {row.skuReason || 'SKU may be cropped or incomplete.'}
                            </div>
                          ) : null}
                        </td>

                        <td className="px-4 py-3">
                          <input
                            value={row.productName}
                            onChange={(e) =>
                              updateReviewRow(row.rowId, { productName: e.target.value })
                            }
                            className="w-64 rounded-lg border px-2 py-1 text-sm"
                          />
                        </td>

                        <td className="px-4 py-3">
                          <div className="relative">
                            <div className="flex gap-2">
                              <input
                                value={row.itemSearch}
                                onChange={(e) =>
                                  updateReviewRow(row.rowId, {
                                    itemSearch: e.target.value,
                                    selectedItemId: '',
                                    dropdownOpen: true,
                                  })
                                }
                                onFocus={() =>
                                  updateReviewRow(row.rowId, { dropdownOpen: true })
                                }
                                placeholder="Search L3..."
                                className="w-72 rounded-lg border px-2 py-1 text-sm"
                              />

                              {row.selectedItemId ? (
                                <button
                                  type="button"
                                  onClick={() => clearReviewItem(row.rowId)}
                                  className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-50"
                                >
                                  Clear
                                </button>
                              ) : null}
                            </div>

                            {row.dropdownOpen ? (
                              <div className="absolute z-30 mt-1 max-h-64 w-80 overflow-y-auto rounded-xl border bg-white shadow-lg">
                                {dropdownItems.length === 0 ? (
                                  <div className="px-4 py-3 text-sm text-slate-600">
                                    No matching L3 items found.
                                  </div>
                                ) : null}
                                {dropdownItems.map((item) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => selectReviewItem(row.rowId, item)}
                                    className="block w-full border-b px-4 py-3 text-left hover:bg-slate-50"
                                  >
                                    <div className="font-medium text-slate-900">
                                      {item.name}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      {item.sku} · {item.unitType}
                                    </div>
                                  </button>
                                ))}
                                {!row.selectedItemId ? (
                                  <button
                                    type="button"
                                    onClick={() => addReviewRowAsNewItem(row)}
                                    disabled={
                                      addingReviewItemRowId === row.rowId ||
                                      Boolean(row.supplierSku && row.skuConfidence < 0.75)
                                    }
                                    title={
                                      row.supplierSku && row.skuConfidence < 0.75
                                        ? 'Correct or clear the cropped SKU first'
                                        : undefined
                                    }
                                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:text-slate-400"
                                  >
                                    <Plus size={16} aria-hidden="true" />
                                    <span>
                                      {addingReviewItemRowId === row.rowId
                                        ? 'Adding new L3...'
                                        : 'Add as new L3 item'}
                                    </span>
                                  </button>
                                ) : null}
                              </div>
                            ) : null}

                            {selectedReviewItem ? (
                              <div className="mt-1 text-xs text-green-700">
                                Selected: {selectedReviewItem.name} [{selectedReviewItem.sku}]
                              </div>
                            ) : row.lineType === 'product' ? (
                              <div className="mt-1 text-xs text-red-700">Needs L3 match</div>
                            ) : (
                              <div className="mt-1 text-xs text-slate-500">
                                Not added to inventory
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="w-40 space-y-2">
                            <input
                              value={row.batchCode}
                              onChange={(e) =>
                                updateReviewRow(row.rowId, { batchCode: e.target.value })
                              }
                              placeholder="Batch / lot"
                              aria-label="Batch or lot number"
                              className="w-full rounded-lg border px-2 py-1 text-sm"
                            />
                            <div className="text-xs text-slate-500">Best before / expiry</div>
                            <input
                              type="date"
                              value={row.expiryDate}
                              onChange={(e) =>
                                updateReviewRow(row.rowId, { expiryDate: e.target.value })
                              }
                              aria-label="Best before or expiry date"
                              className="w-full rounded-lg border px-2 py-1 text-sm"
                            />
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.001"
                            value={row.qty}
                            onChange={(e) =>
                              updateReviewRow(row.rowId, { qty: e.target.value })
                            }
                            className="w-24 rounded-lg border px-2 py-1 text-sm"
                          />
                          <div
                            className={`mt-1 w-32 text-xs ${
                              row.quantityConfidence < 0.75
                                ? 'font-medium text-amber-800'
                                : 'text-slate-500'
                            }`}
                          >
                            <div>
                              Quantity confidence:{' '}
                              {Math.round(row.quantityConfidence * 100)}%
                            </div>
                            <div>{row.quantityReason}</div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <select
                            value={row.unitType}
                            onChange={(e) =>
                              updateReviewRow(row.rowId, {
                                unitType: e.target.value as UnitType | '',
                              })
                            }
                            className="w-24 rounded-lg border px-2 py-1 text-sm"
                          >
                            <option value="">Unit</option>
                            <option value="g">g</option>
                            <option value="ml">ml</option>
                            <option value="each">each</option>
                          </select>
                        </td>

                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.01"
                            value={row.totalCost}
                            onChange={(e) =>
                              updateReviewRow(row.rowId, { totalCost: e.target.value })
                            }
                            className="w-28 rounded-lg border px-2 py-1 text-sm"
                          />
                          {Number(row.qty) > 0 && Number(row.totalCost) > 0 && row.unitType ? (
                            <div className="mt-1 text-xs text-slate-500">
                              {money(Number(row.totalCost) / Number(row.qty), 5)} / {row.unitType}
                            </div>
                          ) : null}
                          <div className="mt-1 text-xs text-slate-500">
                            {row.priceIncludesVat ? 'VAT included' : 'Before VAT'}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          {!priceCheck ? (
                            <div className="w-44 text-xs text-slate-500">
                              No saved supplier price to compare
                            </div>
                          ) : priceCheck.hasIncrease ? (
                            <div className="w-48 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
                              <div className="font-semibold">Price higher than saved</div>
                              <div>Expected {money(priceCheck.expectedTotal, 2)}</div>
                              <div>Scanned {money(Number(row.totalCost), 2)}</div>
                              <div>
                                Diff {money(priceCheck.difference, 2)} (
                                {priceCheck.percent.toFixed(1)}%)
                              </div>
                              <div className="mt-1 text-red-800">{priceCheck.basis}</div>
                            </div>
                          ) : priceCheck.hasDecrease ? (
                            <div className="w-48 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                              <div className="font-semibold">Price lower than saved</div>
                              <div>Expected {money(priceCheck.expectedTotal, 2)}</div>
                              <div>Scanned {money(Number(row.totalCost), 2)}</div>
                              <div>
                                Difference {money(priceCheck.difference, 2)} (
                                {priceCheck.percent.toFixed(1)}%)
                              </div>
                              <div className="mt-1 text-blue-800">{priceCheck.basis}</div>
                            </div>
                          ) : (
                            <div className="w-44 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-800">
                              <div className="font-semibold">Price OK</div>
                              <div>Expected {money(priceCheck.expectedTotal, 2)}</div>
                              <div>{priceCheck.basis}</div>
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <div className="w-36">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={row.vatRatePercent}
                                onChange={(e) => {
                                  const nextRate = e.target.value
                                  updateReviewRow(row.rowId, {
                                    vatRatePercent: nextRate,
                                    vatReclaimStatus:
                                      Number(nextRate) > 0
                                        ? row.vatReclaimStatus === 'NOT_APPLICABLE'
                                          ? 'ELIGIBLE'
                                          : row.vatReclaimStatus
                                        : 'NOT_APPLICABLE',
                                  })
                                }}
                                aria-label="VAT percentage"
                                className="w-20 rounded-lg border px-2 py-1 text-sm"
                              />
                              <span className="text-sm text-slate-600">%</span>
                            </div>
                            <select
                              value={row.vatReclaimStatus}
                              disabled={Number(row.vatRatePercent) <= 0}
                              onChange={(e) =>
                                updateReviewRow(row.rowId, {
                                  vatReclaimStatus: e.target.value as VatReclaimStatus,
                                })
                              }
                              aria-label="VAT treatment"
                              className="mt-1 w-full rounded-md border px-2 py-1 text-xs text-slate-600 disabled:bg-slate-100"
                            >
                              <option value="NOT_APPLICABLE">Not applicable</option>
                              <option value="ELIGIBLE">Eligible</option>
                              <option value="CLAIMED">Claimed</option>
                              <option value="NOT_CLAIMED">Not claimed</option>
                            </select>
                            <div className="mt-1 text-xs text-slate-500">
                              VAT Code: {row.vatCode || 'N/A'}
                            </div>
                            <details className="mt-1 text-xs text-slate-600">
                              <summary className="cursor-pointer text-teal-800">VAT basis</summary>
                              <label className="mt-2 flex items-start gap-2">
                                <input
                                  type="checkbox"
                                  checked={row.priceIncludesVat}
                                  onChange={(e) =>
                                    updateReviewRow(row.rowId, {
                                      priceIncludesVat: e.target.checked,
                                    })
                                  }
                                />
                                <span>Line price includes VAT</span>
                              </label>
                            </details>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-sm text-slate-700">
                          <div>{Math.round(identityMatch.confidence * 100)}%</div>
                          <div
                            className={`w-44 text-xs ${
                              identityMatch.confidence < 1
                                ? 'font-medium text-amber-800'
                                : 'text-slate-500'
                            }`}
                          >
                            {identityMatch.reason}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            Measures SKU + supplier only
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <textarea
                            value={row.notes}
                            onChange={(e) =>
                              updateReviewRow(row.rowId, { notes: e.target.value })
                            }
                            className="h-16 w-56 rounded-lg border px-2 py-1 text-sm"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t px-6 py-4">
              <button
                type="button"
                onClick={saveReviewedDocketRows}
                disabled={docketSaving || docketParsing}
                className="rounded-xl bg-green-700 px-5 py-3 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {docketSaving ? 'Saving…' : 'Save Reviewed Rows to Deliveries'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setParsedDocket(null)
                  setReviewRows([])
                  setReviewSupplier('')
                }}
                disabled={docketSaving}
                className="rounded-xl border px-5 py-3 text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Discard Review
              </button>

              <div className="text-sm text-slate-600">
                Selected rows: {reviewRows.filter((row) => row.include).length}
                {reviewRows.some((row) => row.chargedNotReceived) ? (
                  <>
                    {' '}
                    - Charged, not received:{' '}
                    {reviewRows.filter((row) => row.chargedNotReceived).length}
                  </>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="mt-8 grid gap-4 rounded-2xl border bg-white p-6 shadow-sm md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <h2 className="text-xl font-semibold text-slate-900">Manual Delivery Entry</h2>
          </div>

          <div ref={itemPickerRef} className="relative">
            <label className="mb-1 block text-sm font-medium text-slate-900">L3 Item</label>

            <div className="flex gap-2">
              <input
                value={itemSearch}
                onChange={(e) => {
                  setItemSearch(e.target.value)
                  setItemId('')
                  setLatestSupplierProduct(null)
                  setItemDropdownOpen(true)
                }}
                onFocus={() => setItemDropdownOpen(true)}
                className="w-full rounded-xl border px-3 py-2"
                placeholder="Search by item, SKU, supplier, pack, or weight..."
                autoComplete="off"
                required
              />

              {itemId ? (
                <button
                  type="button"
                  onClick={clearSelectedItem}
                  className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Clear
                </button>
              ) : null}
            </div>

            <input type="hidden" value={itemId} required />

            {itemDropdownOpen ? (
              <div className="absolute z-20 mt-2 max-h-96 w-full overflow-y-auto rounded-xl border bg-white shadow-lg">
                {filteredItems.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-slate-600">
                    No matching L3 items found.
                  </div>
                ) : (
                  filteredItems.map((item) => {
                    const bestProduct = bestSupplierProductForItem(item)
                    const allProducts = supplierProductsByItemId.get(item.id) ?? []

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectItem(item)}
                        className="block w-full border-b px-4 py-3 text-left hover:bg-slate-50 last:border-b-0"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900">{item.name}</div>
                            <div className="text-xs text-slate-500">
                              Flowdish SKU {item.sku} · Unit {item.unitType}
                            </div>

                            <div className="mt-1 text-xs text-slate-700">
                              {packSummary(bestProduct)}
                            </div>

                            {allProducts.length > 1 ? (
                              <div className="mt-1 text-xs text-slate-500">
                                {allProducts.length} supplier pack options linked. Showing cheapest
                                unit price.
                              </div>
                            ) : null}
                          </div>

                          <div className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                            {bestProduct?.unitPrice
                              ? `${money(bestProduct.unitPrice, 5)} / ${item.unitType}`
                              : 'No price'}
                          </div>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            ) : null}

            {selectedItem ? (
              <p className="mt-2 text-sm text-slate-700">
                Selected: {selectedItem.name} [{selectedItem.sku}]
              </p>
            ) : null}

            {loadingPrice ? (
              <p className="mt-2 text-sm text-slate-600">Loading latest supplier price…</p>
            ) : null}

            {selectedItem && latestSupplierProduct ? (
              <div className="mt-2 rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <div className="font-medium text-slate-900">Selected supplier pack</div>
                <div>{packSummary(latestSupplierProduct)}</div>
                {latestSupplierProduct.unitPrice ? (
                  <div className="mt-1">
                    Unit price: {formatUnitPrice(latestSupplierProduct.unitPrice, selectedItem.unitType)}
                  </div>
                ) : null}
              </div>
            ) : selectedItem && !loadingPrice ? (
              <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                No linked supplier price found. Enter supplier and total cost manually.
              </div>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">Delivered At</label>
            <input
              type="date"
              value={deliveredAt}
              onChange={(e) => setDeliveredAt(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              Quantity Delivered {selectedItem ? `(${selectedItem.unitType})` : ''}
            </label>
            <input
              type="number"
              step="0.001"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />
            {selectedItem && latestSupplierProduct?.weight ? (
              <p className="mt-1 text-xs text-slate-600">
                Pack reference: {latestSupplierProduct.packSize || 'Pack'} ·{' '}
                {latestSupplierProduct.weight}. Enter the delivered quantity in{' '}
                {selectedItem.unitType}.
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">Supplier</label>
            <input
              value={supplier}
              onChange={(e) => {
                setSupplier(e.target.value)
                setSupplierManuallyEdited(true)
              }}
              className="w-full rounded-xl border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">Batch Code</label>
            <div className="flex gap-2">
              <input
                value={batchCode}
                onChange={(e) => setBatchCode(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
                placeholder="Enter batch code"
              />
              <button
                type="button"
                onClick={() => setBatchCode('N/A')}
                className="rounded-xl border px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
              >
                N/A
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              Total Delivery Cost (€)
            </label>
            <input
              type="number"
              step="0.01"
              value={totalCost}
              onChange={(e) => {
                setTotalCost(e.target.value)
                setPriceManuallyEdited(true)
              }}
              className="w-full rounded-xl border px-3 py-2"
              required
            />

            {selectedItem && calculatedUnitCost !== null ? (
              <p className="mt-2 text-sm text-slate-700">
                Calculated cost: {money(calculatedUnitCost, 5)} per {selectedItem.unitType}
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              VAT Rate (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={vatRatePercent}
              onChange={(e) => {
                const nextRate = e.target.value
                setVatRatePercent(nextRate)
                setVatReclaimStatus((current) =>
                  Number(nextRate) > 0
                    ? current === 'NOT_APPLICABLE'
                      ? 'ELIGIBLE'
                      : current
                    : 'NOT_APPLICABLE'
                )
              }}
              className="w-full rounded-xl border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              VAT Treatment
            </label>
            <select
              value={vatReclaimStatus}
              disabled={Number(vatRatePercent) <= 0}
              onChange={(e) => setVatReclaimStatus(e.target.value as VatReclaimStatus)}
              className="w-full rounded-xl border px-3 py-2 disabled:bg-slate-100"
            >
              <option value="NOT_APPLICABLE">Not applicable</option>
              <option value="ELIGIBLE">Eligible to reclaim</option>
              <option value="CLAIMED">Claimed</option>
              <option value="NOT_CLAIMED">Not claimed</option>
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex w-full items-start gap-3 rounded-lg border bg-slate-50 px-4 py-3 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={deliveryVehicleOk}
                onChange={(e) => setDeliveryVehicleOk(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="block font-semibold">Delivery Vehicle OK</span>
                <span className="mt-0.5 block text-xs text-slate-600">
                  Delivery vehicle cleanliness checked.
                </span>
              </span>
            </label>
          </div>

          <div className="flex items-end">
            <button type="submit" className="rounded-xl bg-slate-900 px-5 py-3 text-white">
              Save Delivery
            </button>
          </div>
        </form>

        <div className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1690px] w-full text-left">
              <thead className="bg-slate-100 text-sm">
                <tr>
                  <th className="px-4 py-3 text-slate-800">Date</th>
                  <th className="px-4 py-3 text-slate-800">Delivery Vehicle OK</th>
                  <th className="px-4 py-3 text-slate-800">Item</th>
                  <th className="px-4 py-3 text-slate-800">Qty</th>
                  <th className="px-4 py-3 text-slate-800">Unit</th>
                  <th className="px-4 py-3 text-slate-800">Supplier</th>
                  <th className="px-4 py-3 text-slate-800">Total Cost</th>
                  <th className="px-4 py-3 text-slate-800">VAT</th>
                  <th className="px-4 py-3 text-slate-800">VAT Treatment</th>
                  <th className="px-4 py-3 text-slate-800">Cost / Unit</th>
                  <th className="px-4 py-3 text-slate-800">Expiry</th>
                  <th className="px-4 py-3 text-slate-800">Entered</th>
                  <th className="px-4 py-3 text-slate-800">Actions</th>
                </tr>
              </thead>

              <tbody>
                {deliveries.length === 0 ? (
                  <tr className="border-t">
                    <td className="px-4 py-3 text-slate-700" colSpan={13}>
                      No deliveries yet.
                    </td>
                  </tr>
                ) : (
                  deliveries.map((delivery) => {
                    const unitCost =
                      delivery.price && delivery.qty > 0 ? delivery.price / delivery.qty : 0

                    const isEditing = editingDeliveryId === delivery.id && editingDelivery

                    const editingUnitCost =
                      isEditing &&
                      Number(editingDelivery.qty) > 0 &&
                      Number(editingDelivery.totalCost) > 0
                        ? Number(editingDelivery.totalCost) / Number(editingDelivery.qty)
                        : unitCost

                    return (
                      <tr
                        key={delivery.id}
                        id={`delivery-${delivery.id}`}
                        className="scroll-mt-24 border-t align-top"
                      >
                        <td className="px-4 py-3 text-slate-800">
                          {isEditing ? (
                            <input
                              type="date"
                              value={editingDelivery.deliveredAt}
                              onChange={(e) =>
                                setEditingDelivery({
                                  ...editingDelivery,
                                  deliveredAt: e.target.value,
                                })
                              }
                              className="rounded-lg border px-2 py-1 text-sm"
                            />
                          ) : (
                            formatDate(delivery.deliveredAt)
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          {isEditing ? (
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={editingDelivery.deliveryVehicleOk}
                                onChange={(e) =>
                                  setEditingDelivery({
                                    ...editingDelivery,
                                    deliveryVehicleOk: e.target.checked,
                                  })
                                }
                                className="h-4 w-4"
                              />
                              OK
                            </label>
                          ) : (
                            <input
                              type="checkbox"
                              checked={delivery.deliveryVehicleOk}
                              disabled
                              aria-label={
                                delivery.deliveryVehicleOk
                                  ? 'Delivery vehicle OK'
                                  : 'Delivery vehicle not marked OK'
                              }
                              className="h-4 w-4 disabled:opacity-100"
                            />
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          {delivery.item.name} [{delivery.item.sku}]
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.001"
                              value={editingDelivery.qty}
                              onChange={(e) =>
                                setEditingDelivery({
                                  ...editingDelivery,
                                  qty: e.target.value,
                                })
                              }
                              className="w-24 rounded-lg border px-2 py-1 text-sm"
                            />
                          ) : (
                            delivery.qty
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-800">{delivery.unitType}</td>

                        <td className="px-4 py-3 text-slate-800">
                          {isEditing ? (
                            <input
                              value={editingDelivery.supplier}
                              onChange={(e) =>
                                setEditingDelivery({
                                  ...editingDelivery,
                                  supplier: e.target.value,
                                })
                              }
                              className="w-32 rounded-lg border px-2 py-1 text-sm"
                            />
                          ) : (
                            delivery.supplier ?? ''
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.01"
                              value={editingDelivery.totalCost}
                              onChange={(e) =>
                                setEditingDelivery({
                                  ...editingDelivery,
                                  totalCost: e.target.value,
                                })
                              }
                              className="w-28 rounded-lg border px-2 py-1 text-sm"
                            />
                          ) : (
                            money(delivery.price)
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          {isEditing ? (
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={editingDelivery.vatRatePercent}
                              onChange={(e) => {
                                const nextRate = e.target.value
                                setEditingDelivery({
                                  ...editingDelivery,
                                  vatRatePercent: nextRate,
                                  vatReclaimStatus:
                                    Number(nextRate) > 0
                                      ? editingDelivery.vatReclaimStatus === 'NOT_APPLICABLE'
                                        ? 'ELIGIBLE'
                                        : editingDelivery.vatReclaimStatus
                                      : 'NOT_APPLICABLE',
                                })
                              }}
                              className="w-20 rounded-lg border px-2 py-1 text-sm"
                            />
                          ) : (
                            <div>
                              <div>{delivery.vatRatePercent}%</div>
                              <div className="text-xs text-slate-500">
                                {money(delivery.vatAmount)}
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          {isEditing ? (
                            <select
                              value={editingDelivery.vatReclaimStatus}
                              disabled={Number(editingDelivery.vatRatePercent) <= 0}
                              onChange={(e) =>
                                setEditingDelivery({
                                  ...editingDelivery,
                                  vatReclaimStatus: e.target.value as VatReclaimStatus,
                                })
                              }
                              className="w-36 rounded-lg border px-2 py-1 text-sm disabled:bg-slate-100"
                            >
                              <option value="NOT_APPLICABLE">Not applicable</option>
                              <option value="ELIGIBLE">Eligible</option>
                              <option value="CLAIMED">Claimed</option>
                              <option value="NOT_CLAIMED">Not claimed</option>
                            </select>
                          ) : (
                            delivery.vatReclaimStatus.replaceAll('_', ' ')
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          {money(editingUnitCost, 5)} / {delivery.unitType}
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          {isEditing ? (
                            <input
                              type="date"
                              value={editingDelivery.expiryAt}
                              onChange={(e) =>
                                setEditingDelivery({
                                  ...editingDelivery,
                                  expiryAt: e.target.value,
                                })
                              }
                              className="rounded-lg border px-2 py-1 text-sm"
                            />
                          ) : (
                            formatDate(delivery.expiryAt)
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <div className="text-xs text-slate-500">
                            {enteredByLabel(delivery)}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => saveDeliveryEdit(delivery)}
                                  className="rounded-lg border border-green-300 px-3 py-1 text-sm text-green-700 hover:bg-green-50"
                                >
                                  Save
                                </button>

                                <button
                                  type="button"
                                  onClick={cancelEditDelivery}
                                  className="rounded-lg border px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startEditDelivery(delivery)}
                                  className="rounded-lg border px-3 py-1 text-sm text-slate-800 hover:bg-slate-50"
                                >
                                  Edit
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDelete(
                                      delivery.id,
                                      `${delivery.item.name} (${delivery.qty} ${delivery.unitType})`
                                    )
                                  }
                                  className="rounded-lg border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Deliveries can only be edited while none of their stock has been used.
        </div>
      </div>
    </main>
  )
}
