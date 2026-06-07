'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type UnitType = 'g' | 'ml' | 'each'

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
  qty: number | null
  unitType: UnitType | null
  packPrice: number | null
  lineTotal: number | null
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
  rows: ParsedDocketRow[]
  rawExtracted?: unknown
}

type ReviewRow = {
  rowId: string
  include: boolean
  supplier: string
  supplierSku: string
  productName: string
  qty: string
  unitType: UnitType | ''
  totalCost: string
  selectedItemId: string
  itemSearch: string
  dropdownOpen: boolean
  confidence: number
  matchReason: string
  notes: string
}

type EditingDelivery = {
  deliveredAt: string
  qty: string
  supplier: string
  totalCost: string
  expiryAt: string
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 10)
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
  const [batchCode, setBatchCode] = useState('')
  const [latestSupplierProduct, setLatestSupplierProduct] =
    useState<LatestSupplierProduct | null>(null)
  const [priceManuallyEdited, setPriceManuallyEdited] = useState(false)
  const [supplierManuallyEdited, setSupplierManuallyEdited] = useState(false)

  const [editingDeliveryId, setEditingDeliveryId] = useState<string | null>(null)
  const [editingDelivery, setEditingDelivery] = useState<EditingDelivery | null>(null)

  const [docketFile, setDocketFile] = useState<File | null>(null)
  const [docketParsing, setDocketParsing] = useState(false)
  const [docketSaving, setDocketSaving] = useState(false)
  const [parsedDocket, setParsedDocket] = useState<ParsedDocketResponse | null>(null)
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([])

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loadingPrice, setLoadingPrice] = useState(false)

  const itemPickerRef = useRef<HTMLDivElement | null>(null)

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

  function selectReviewItem(rowId: string, item: Item) {
    updateReviewRow(rowId, {
      selectedItemId: item.id,
      itemSearch: `${item.name} [${item.sku}]`,
      unitType: item.unitType,
      dropdownOpen: false,
    })
  }

  function clearReviewItem(rowId: string) {
    updateReviewRow(rowId, {
      selectedItemId: '',
      itemSearch: '',
      dropdownOpen: false,
    })
  }

  async function parseDocket() {
    try {
      setError('')
      setMessage('')
      setParsedDocket(null)
      setReviewRows([])

      if (!docketFile) {
        throw new Error('Choose a delivery docket image or PDF first.')
      }

      setDocketParsing(true)

      const formData = new FormData()
      formData.append('file', docketFile)

      const res = await fetch('/api/parse-delivery-docket', {
        method: 'POST',
        body: formData,
      })

      const data = (await safeJson(res)) as ParsedDocketResponse & { error?: string }

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to parse delivery docket')
      }

      const mappedRows: ReviewRow[] = (data.rows || []).map((row, index) => {
        const matchedItem = row.matchedItemId
          ? items.find((item) => item.id === row.matchedItemId)
          : null

        return {
          rowId: `${Date.now()}-${index}`,
          include: true,
          supplier: row.supplier || data.supplier || '',
          supplierSku: row.supplierSku || '',
          productName: row.productName || '',
          qty: toInputValue(row.qty),
          unitType: row.matchedItemUnitType || row.unitType || matchedItem?.unitType || '',
          totalCost: toInputValue(row.lineTotal ?? row.packPrice),
          selectedItemId: row.matchedItemId || '',
          itemSearch:
            row.matchedItemName && row.matchedItemSku
              ? `${row.matchedItemName} [${row.matchedItemSku}]`
              : '',
          dropdownOpen: false,
          confidence: row.confidence || 0,
          matchReason: row.matchReason || '',
          notes: row.notes || '',
        }
      })

      setParsedDocket(data)
      setReviewRows(mappedRows)

      if (data.deliveryDate) {
        setDeliveredAt(data.deliveryDate)
      }

      setMessage(
        `Docket parsed. ${mappedRows.length} row(s) found. Review before saving to inventory.`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setDocketParsing(false)
    }
  }

  async function saveReviewedDocketRows() {
    try {
      setError('')
      setMessage('')
      setDocketSaving(true)

      const rowsToSave = reviewRows.filter((row) => row.include)

      if (rowsToSave.length === 0) {
        throw new Error('No rows selected to save.')
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

      setMessage(`${savedCount} delivery row(s) saved and inventory increased.`)
      setParsedDocket(null)
      setReviewRows([])
      setDocketFile(null)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setDocketSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-semibold text-slate-900">Deliveries</h1>

        {error ? (
          <div className="mt-4 whitespace-pre-wrap rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="mt-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
            {message}
          </div>
        ) : null}

        <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Upload Delivery Docket</h2>
          <p className="mt-2 text-sm text-slate-700">
            Upload a photo, scan, or PDF. The system will extract lines, suggest L3 matches, then
            you review before saving.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Docket file
              </label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => {
                  setDocketFile(e.target.files?.[0] ?? null)
                  setParsedDocket(null)
                  setReviewRows([])
                  setError('')
                  setMessage('')
                }}
                className="w-full rounded-xl border bg-white px-3 py-2 text-slate-900 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-white"
              />
              {docketFile ? (
                <p className="mt-2 text-sm text-slate-600">Selected: {docketFile.name}</p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={parseDocket}
              disabled={docketParsing || docketSaving}
              className="rounded-xl bg-slate-900 px-5 py-3 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {docketParsing ? 'Parsing…' : 'Parse Docket'}
            </button>

            <button
              type="button"
              onClick={() => {
                setDocketFile(null)
                setParsedDocket(null)
                setReviewRows([])
              }}
              disabled={docketParsing || docketSaving}
              className="rounded-xl border px-5 py-3 text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Clear
            </button>
          </div>
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
              <div className="mt-3 max-w-sm">
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
            </div>

            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-[1650px] w-full text-left">
                <thead className="bg-slate-100 text-sm">
                  <tr>
                    <th className="px-4 py-3 text-slate-800">Save</th>
                    <th className="px-4 py-3 text-slate-800">Supplier</th>
                    <th className="px-4 py-3 text-slate-800">Supplier SKU</th>
                    <th className="px-4 py-3 text-slate-800">Docket Product</th>
                    <th className="px-4 py-3 text-slate-800">Matched L3</th>
                    <th className="px-4 py-3 text-slate-800">Qty</th>
                    <th className="px-4 py-3 text-slate-800">Unit</th>
                    <th className="px-4 py-3 text-slate-800">Total Cost</th>
                    <th className="px-4 py-3 text-slate-800">Confidence</th>
                    <th className="px-4 py-3 text-slate-800">Notes</th>
                  </tr>
                </thead>

                <tbody>
                  {reviewRows.map((row) => {
                    const selectedReviewItem = items.find(
                      (item) => item.id === row.selectedItemId
                    )
                    const dropdownItems = filteredReviewItems(row.itemSearch)

                    return (
                      <tr key={row.rowId} className="border-t align-top">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={row.include}
                            onChange={(e) =>
                              updateReviewRow(row.rowId, { include: e.target.checked })
                            }
                          />
                        </td>

                        <td className="px-4 py-3">
                          <input
                            value={row.supplier}
                            onChange={(e) =>
                              updateReviewRow(row.rowId, { supplier: e.target.value })
                            }
                            className="w-32 rounded-lg border px-2 py-1 text-sm"
                          />
                        </td>

                        <td className="px-4 py-3">
                          <input
                            value={row.supplierSku}
                            onChange={(e) =>
                              updateReviewRow(row.rowId, { supplierSku: e.target.value })
                            }
                            className="w-32 rounded-lg border px-2 py-1 text-sm"
                          />
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
                                ) : (
                                  dropdownItems.map((item) => (
                                    <button
                                      key={item.id}
                                      type="button"
                                      onClick={() => selectReviewItem(row.rowId, item)}
                                      className="block w-full border-b px-4 py-3 text-left hover:bg-slate-50 last:border-b-0"
                                    >
                                      <div className="font-medium text-slate-900">
                                        {item.name}
                                      </div>
                                      <div className="text-xs text-slate-500">
                                        {item.sku} · {item.unitType}
                                      </div>
                                    </button>
                                  ))
                                )}
                              </div>
                            ) : null}

                            {selectedReviewItem ? (
                              <div className="mt-1 text-xs text-green-700">
                                Selected: {selectedReviewItem.name} [{selectedReviewItem.sku}]
                              </div>
                            ) : (
                              <div className="mt-1 text-xs text-red-700">Needs L3 match</div>
                            )}
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
                        </td>

                        <td className="px-4 py-3 text-sm text-slate-700">
                          <div>{Math.round((row.confidence || 0) * 100)}%</div>
                          <div className="text-xs text-slate-500">{row.matchReason}</div>
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
                }}
                disabled={docketSaving}
                className="rounded-xl border px-5 py-3 text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Discard Review
              </button>

              <div className="text-sm text-slate-600">
                Selected rows: {reviewRows.filter((row) => row.include).length}
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

          <div className="flex items-end">
            <button type="submit" className="rounded-xl bg-slate-900 px-5 py-3 text-white">
              Save Delivery
            </button>
          </div>
        </form>

        <div className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1250px] w-full text-left">
              <thead className="bg-slate-100 text-sm">
                <tr>
                  <th className="px-4 py-3 text-slate-800">Date</th>
                  <th className="px-4 py-3 text-slate-800">Item</th>
                  <th className="px-4 py-3 text-slate-800">Qty</th>
                  <th className="px-4 py-3 text-slate-800">Unit</th>
                  <th className="px-4 py-3 text-slate-800">Supplier</th>
                  <th className="px-4 py-3 text-slate-800">Total Cost</th>
                  <th className="px-4 py-3 text-slate-800">Cost / Unit</th>
                  <th className="px-4 py-3 text-slate-800">Expiry</th>
                  <th className="px-4 py-3 text-slate-800">Entered</th>
                  <th className="px-4 py-3 text-slate-800">Actions</th>
                </tr>
              </thead>

              <tbody>
                {deliveries.length === 0 ? (
                  <tr className="border-t">
                    <td className="px-4 py-3 text-slate-700" colSpan={10}>
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
                      <tr key={delivery.id} className="border-t align-top">
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
