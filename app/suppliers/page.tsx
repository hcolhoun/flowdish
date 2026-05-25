'use client'

import { useEffect, useMemo, useState } from 'react'

type UnitType = 'g' | 'ml' | 'each'

type Item = {
  id: string
  sku: string
  name: string
  itemType: 'L1' | 'L2' | 'L3'
  unitType: UnitType
  shelfLifeDays: number | null
  sellingPrice?: number | null
  standardBatchOutput?: number | null
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
  createdAt: string
  linkedItemId: string | null
  linkedItem?: Item | null
}

type ImportRow = {
  supplier: string
  supplierSku: string | null
  name: string
  packSize: string | null
  weight: string | null
  packPrice: number | null
  unitPrice: number | null
  raw?: string
  reason?: string
  status?: 'ready' | 'review'
}

type ParseResponse =
  | ImportRow[]
  | {
      ready?: ImportRow[]
      needsReview?: ImportRow[]
      rejected?: ImportRow[]
      debug?: Record<string, unknown>
      error?: string
    }

type EditingProduct = {
  supplier: string
  supplierSku: string
  name: string
  packSize: string
  weight: string
  packPrice: string
  unitPrice: string
}

type EditingL3 = {
  sku: string
  name: string
  unitType: UnitType
  shelfLifeDays: string
}

type ManualSupplierProduct = {
  supplier: string
  supplierSku: string
  name: string
  packSize: string
  weight: string
  packPrice: string
  unitPrice: string
  createLinkedL3: boolean
}

type ImportImpactRow = {
  itemId: string
  sku: string
  name: string
  sellingPrice: number | null
  oldCogs: number
  newCogs: number
  cogsChange: number
  oldGrossMarginPercent: number | null
  newGrossMarginPercent: number | null
  suggestedSellingPriceAtTargetMargin: number | null
  targetMarginPercent: number
  status: 'GREEN' | 'AMBER' | 'RED' | 'NO_PRICE'
  changedInputs: Array<{
    supplier: string
    supplierSku: string | null
    supplierProductName: string
    l3Sku: string | null
    l3Name: string | null
    oldUnitPrice: number | null
    newUnitPrice: number | null
    oldPackPrice: number | null
    newPackPrice: number | null
    usedIn: 'DIRECT_L1_L3' | 'INDIRECT_L2_L3'
    l2Name: string | null
    l2Sku: string | null
  }>
}

type ImportImpactResponse = {
  importBatch: {
    id: string
    supplier: string
    parsedCount: number
    createdCount: number
    updatedCount: number
    priceChangeCount: number
    createdAt: string
  }
  affectedL1s: ImportImpactRow[]
}

function toInputValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function toNullableString(value: string) {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function toNullableNumber(value: string) {
  const trimmed = value.trim()
  if (trimmed === '') return null

  const number = Number(trimmed)
  return Number.isFinite(number) ? number : null
}

function formatDate(value: string | null | undefined) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-GB')
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return ''
  return `${value.toFixed(1)}%`
}

function statusLabel(status: ImportImpactRow['status']) {
  if (status === 'GREEN') return '✅ OK'
  if (status === 'AMBER') return '⚠️ Watch'
  if (status === 'RED') return '🔴 Review price'
  return 'No selling price'
}

export default function SuppliersPage() {
  const [supplier, setSupplier] = useState<'Caterway' | 'Sysco'>('Caterway')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')

  const [preview, setPreview] = useState<ImportRow[]>([])
  const [rejectedRows, setRejectedRows] = useState<ImportRow[]>([])
  const [products, setProducts] = useState<SupplierProduct[]>([])

  const [manualProduct, setManualProduct] = useState<ManualSupplierProduct>({
    supplier: 'Caterway',
    supplierSku: '',
    name: '',
    packSize: '',
    weight: '',
    packPrice: '',
    unitPrice: '',
    createLinkedL3: true,
  })

  const [search, setSearch] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('ALL')
  const [linkFilter, setLinkFilter] = useState('ALL')

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [loading, setLoading] = useState(false)

  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [editingProduct, setEditingProduct] = useState<EditingProduct | null>(null)

  const [editingL3Id, setEditingL3Id] = useState<string | null>(null)
  const [editingL3, setEditingL3] = useState<EditingL3 | null>(null)

  const [impactReport, setImpactReport] = useState<ImportImpactResponse | null>(null)
  const [loadingImpact, setLoadingImpact] = useState(false)

  async function safeJson(res: Response) {
    const text = await res.text()

    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 1000))
    }
  }

  function money(value: number | null | undefined, maximumFractionDigits = 4) {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits,
    }).format(value ?? 0)
  }

  function unitPriceLabel(product: SupplierProduct | ImportRow) {
    if (product.unitPrice === null || product.unitPrice === undefined) return ''

    const text = `${product.weight || ''} ${product.packSize || ''}`.toLowerCase()

    if (text.includes('kg') || text.includes('g')) {
      return `${money(product.unitPrice, 6)} / g`
    }

    if (
      text.includes('ltr') ||
      text.includes('litre') ||
      text.includes('l') ||
      text.includes('ml')
    ) {
      return `${money(product.unitPrice, 6)} / ml`
    }

    return `${money(product.unitPrice, 4)} / each`
  }

  async function loadProducts() {
    try {
      setLoading(true)
      setError('')

      const res = await fetch('/api/supplier-products', { cache: 'no-store' })
      const data = await safeJson(res)

      if (!res.ok) throw new Error(data?.error || 'Failed to load supplier products')

      setProducts(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  async function loadImpactReport(importBatchId: string) {
    try {
      setLoadingImpact(true)
      setImpactReport(null)

      const res = await fetch(
        `/api/supplier-products/import-impact?importBatchId=${encodeURIComponent(
          importBatchId
        )}`,
        { cache: 'no-store' }
      )

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load import impact report')
      }

      setImpactReport(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoadingImpact(false)
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

  const suppliers = useMemo(() => {
    return Array.from(new Set(products.map((p) => p.supplier))).sort()
  }, [products])

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim()

    return products.filter((product) => {
      const matchesSearch =
        !q ||
        product.name.toLowerCase().includes(q) ||
        (product.supplierSku || '').toLowerCase().includes(q) ||
        (product.linkedItem?.name || '').toLowerCase().includes(q) ||
        (product.linkedItem?.sku || '').toLowerCase().includes(q)

      const matchesSupplier = supplierFilter === 'ALL' || product.supplier === supplierFilter

      const matchesLink =
        linkFilter === 'ALL' ||
        (linkFilter === 'LINKED' && product.linkedItemId) ||
        (linkFilter === 'UNLINKED' && !product.linkedItemId)

      return matchesSearch && matchesSupplier && matchesLink
    })
  }, [products, search, supplierFilter, linkFilter])

  const visibleProducts = filteredProducts.slice(0, 200)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError('')
    setMessage('')
    setPreview([])
    setRejectedRows([])
    setImpactReport(null)
    setSelectedFile(null)
    setFileName('')

    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFile(file)
    setFileName(file.name)
    setMessage(`File selected: ${file.name}. Click "Parse Price File" next.`)
  }

  function normaliseParseData(data: ParseResponse) {
    if (Array.isArray(data)) {
      return {
        ready: data.map((row) => ({ ...row, status: 'ready' as const })),
        rejected: [] as ImportRow[],
      }
    }

    const ready = (data.ready ?? []).map((row) => ({
      ...row,
      status: 'ready' as const,
    }))

    const review = (data.needsReview ?? []).map((row) => ({
      ...row,
      status: 'review' as const,
    }))

    const rejected = data.rejected ?? []

    return {
      ready: [...ready, ...review],
      rejected,
    }
  }

  async function handleParse() {
    try {
      setError('')
      setMessage('')
      setPreview([])
      setRejectedRows([])
      setImpactReport(null)
      setParsing(true)

      if (!selectedFile) {
        setError('Choose a file first.')
        return
      }

      const endpoint =
        supplier === 'Caterway'
          ? '/api/parse-caterway'
          : supplier === 'Sysco'
            ? '/api/parse-sysco'
            : ''

      if (!endpoint) {
        setError('No parser is available for this supplier yet.')
        return
      }

      const formData = new FormData()
      formData.append('file', selectedFile)

      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(
          data?.error
            ? `${data.error}\n\n${data?.debug ? JSON.stringify(data.debug, null, 2) : ''}`
            : 'Failed to parse file'
        )
      }

      const normalised = normaliseParseData(data)

      setPreview(normalised.ready)
      setRejectedRows(normalised.rejected)

      if (normalised.ready.length === 0) {
        setError('No rows were parsed from the file.')
        return
      }

      const reviewCount = normalised.ready.filter((row) => row.status === 'review').length

      setMessage(
        `${normalised.ready.length} rows parsed. ${
          reviewCount > 0 ? `${reviewCount} row(s) need review but can be edited and saved.` : ''
        }`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setParsing(false)
    }
  }

  function updatePreviewRow(index: number, field: keyof ImportRow, value: string) {
    setPreview((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex !== index) return row

        if (field === 'packPrice' || field === 'unitPrice') {
          return {
            ...row,
            [field]: toNullableNumber(value),
          }
        }

        if (field === 'supplierSku' || field === 'packSize' || field === 'weight') {
          return {
            ...row,
            [field]: toNullableString(value),
          }
        }

        return {
          ...row,
          [field]: value,
        }
      })
    )
  }

  function removePreviewRow(index: number) {
    setPreview((prev) => prev.filter((_, rowIndex) => rowIndex !== index))
  }

  async function handleSave() {
    try {
      setError('')
      setMessage('')
      setImpactReport(null)
      setSaving(true)

      if (preview.length === 0) {
        setError('No parsed products to save. Parse the file first.')
        return
      }

      const productsToSave = preview
        .filter((row) => row.name.trim() && row.supplierSku && row.packPrice !== null)
        .map((row) => ({
          supplier: row.supplier || supplier,
          supplierSku: row.supplierSku,
          name: row.name,
          packSize: row.packSize,
          weight: row.weight,
          packPrice: row.packPrice,
          unitPrice: row.unitPrice,
        }))

      if (productsToSave.length === 0) {
        setError('No valid rows to save. Check name, supplier SKU, and pack price.')
        return
      }

      setMessage('Saving supplier products and creating/updating linked L3 items. Please wait...')

      const res = await fetch('/api/supplier-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier,
          fileName,
          products: productsToSave,
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save supplier products')
      }

      setMessage(
        `${productsToSave.length} supplier products saved. ${
          data.linkedCount ?? 0
        } linked to L3 items. ${data.priceChangeCount ?? 0} price change(s) detected.`
      )

      setPreview([])
      setRejectedRows([])
      setSelectedFile(null)
      setFileName('')

      await loadProducts()

      if (data.importBatchId) {
        await loadImpactReport(data.importBatchId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

async function handlePriceOnlySave() {
  try {
    setError('')
    setMessage('')
    setImpactReport(null)
    setSaving(true)

    if (preview.length === 0) {
      setError('No parsed price rows to apply. Parse the file first.')
      return
    }

    const rowsToApply = preview
      .filter((row) => row.supplierSku && (row.packPrice !== null || row.unitPrice !== null))
      .map((row) => ({
        supplier: row.supplier || supplier,
        supplierSku: row.supplierSku,
        name: row.name,
        packSize: row.packSize,
        weight: row.weight,
        packPrice: row.packPrice,
        unitPrice: row.unitPrice,
        selected: true,
      }))

    if (rowsToApply.length === 0) {
      setError('No valid price rows to apply. Check supplier SKU and price fields.')
      return
    }

    setMessage(
      'Applying price-only updates. Existing product names, pack sizes, weights, links, and L3s will not be changed.'
    )

    const res = await fetch('/api/supplier-products/price-import/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier,
        fileName,
        rows: rowsToApply,
      }),
    })

    const data = await safeJson(res)

    if (!res.ok) {
      throw new Error(data?.error || 'Failed to apply price-only updates')
    }

    setMessage(
      `Price-only import complete. ${data.summary?.updatedCount ?? 0} updated, ${
        data.summary?.unchangedCount ?? 0
      } unchanged, ${data.summary?.skippedCount ?? 0} skipped.`
    )

    setPreview([])
    setRejectedRows([])
    setSelectedFile(null)
    setFileName('')

    await loadProducts()

    if (data.importBatchId) {
      await loadImpactReport(data.importBatchId)
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Unknown error')
  } finally {
    setSaving(false)
  }
}

  async function handleManualAddProduct(e: React.FormEvent) {
    e.preventDefault()

    try {
      setError('')
      setMessage('')
      setImpactReport(null)
      setSaving(true)

      const cleanProduct = {
        supplier: manualProduct.supplier.trim(),
        supplierSku: toNullableString(manualProduct.supplierSku),
        name: manualProduct.name.trim(),
        packSize: toNullableString(manualProduct.packSize),
        weight: toNullableString(manualProduct.weight),
        packPrice: toNullableNumber(manualProduct.packPrice),
        unitPrice: toNullableNumber(manualProduct.unitPrice),
      }

      if (!cleanProduct.supplier) {
        throw new Error('Supplier is required.')
      }

      if (!cleanProduct.name) {
        throw new Error('Product name is required.')
      }

      if (cleanProduct.packPrice === null && cleanProduct.unitPrice === null) {
        throw new Error('Enter either pack price or unit price.')
      }

      const res = await fetch('/api/supplier-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier: cleanProduct.supplier,
          fileName: 'Manual entry',
          createLinkedL3: manualProduct.createLinkedL3,
          products: [cleanProduct],
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to add supplier product')
      }

      setMessage(
        `Manual supplier product saved. ${data.createdCount ?? 0} created, ${
          data.updatedCount ?? 0
        } updated, ${data.linkedCount ?? 0} linked to L3.`
      )

      setManualProduct({
        supplier: manualProduct.supplier,
        supplierSku: '',
        name: '',
        packSize: '',
        weight: '',
        packPrice: '',
        unitPrice: '',
        createLinkedL3: true,
      })

      await loadProducts()

      if (data.importBatchId) {
        await loadImpactReport(data.importBatchId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  function startEditProduct(product: SupplierProduct) {
    setEditingProductId(product.id)
    setEditingProduct({
      supplier: product.supplier,
      supplierSku: product.supplierSku ?? '',
      name: product.name,
      packSize: product.packSize ?? '',
      weight: product.weight ?? '',
      packPrice: toInputValue(product.packPrice),
      unitPrice: toInputValue(product.unitPrice),
    })

    setEditingL3Id(null)
    setEditingL3(null)
  }

  function cancelEditProduct() {
    setEditingProductId(null)
    setEditingProduct(null)
  }

  async function saveProductEdit(productId: string) {
    if (!editingProduct) return

    try {
      setError('')
      setMessage('')

      const res = await fetch('/api/supplier-products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: productId,
          supplier: editingProduct.supplier,
          supplierSku: toNullableString(editingProduct.supplierSku),
          name: editingProduct.name,
          packSize: toNullableString(editingProduct.packSize),
          weight: toNullableString(editingProduct.weight),
          packPrice: toNullableNumber(editingProduct.packPrice),
          unitPrice: toNullableNumber(editingProduct.unitPrice),
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to update supplier product')
      }

      setMessage('Supplier product updated.')
      cancelEditProduct()
      await loadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  async function deleteProduct(product: SupplierProduct) {
    const confirmed = window.confirm(
      `Delete supplier product?\n\n${product.name}\nSKU: ${
        product.supplierSku ?? 'N/A'
      }\nSupplier: ${
        product.supplier
      }\n\nThis will delete the supplier product only. It will not delete the linked L3 item.`
    )

    if (!confirmed) return

    try {
      setError('')
      setMessage('')

      const res = await fetch(`/api/supplier-products?id=${product.id}`, {
        method: 'DELETE',
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to delete supplier product')
      }

      setMessage('Supplier product deleted.')

      if (editingProductId === product.id) {
        cancelEditProduct()
      }

      await loadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  function startEditL3(item: Item) {
    setEditingL3Id(item.id)
    setEditingL3({
      sku: item.sku,
      name: item.name,
      unitType: item.unitType,
      shelfLifeDays: toInputValue(item.shelfLifeDays),
    })

    setEditingProductId(null)
    setEditingProduct(null)
  }

  function cancelEditL3() {
    setEditingL3Id(null)
    setEditingL3(null)
  }

  async function saveL3Edit(itemId: string) {
    if (!editingL3) return

    try {
      setError('')
      setMessage('')

      const res = await fetch('/api/items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: itemId,
          sku: editingL3.sku,
          name: editingL3.name,
          unitType: editingL3.unitType,
          shelfLifeDays: toNullableNumber(editingL3.shelfLifeDays),
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to update linked L3')
      }

      setMessage('Linked L3 item updated.')
      cancelEditL3()
      await loadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Supplier Products</h1>
            <p className="mt-2 text-slate-800">
              Upload supplier price lists, review parsed rows, create L3 items, edit supplier
              products, and see which L1 dishes are affected by price changes.
            </p>
          </div>

          {loading ? (
            <div className="rounded-xl border bg-white px-4 py-2 text-sm text-slate-600">
              Loading products…
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mt-4 whitespace-pre-wrap rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="mt-4 whitespace-pre-wrap rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
            {message}
          </div>
        ) : null}

        {saving ? (
          <div className="mt-4 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            Saving supplier products and linked L3s. Do not refresh this page.
          </div>
        ) : null}

        <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Upload Price List</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Supplier</label>
              <select
                value={supplier}
                onChange={(e) => {
                  setSupplier(e.target.value as 'Caterway' | 'Sysco')
                  setPreview([])
                  setRejectedRows([])
                  setImpactReport(null)
                  setError('')
                  setMessage('')
                }}
                className="w-full rounded-xl border px-3 py-2 text-slate-900"
              >
                <option value="Caterway">Caterway PDF</option>
                <option value="Sysco">Sysco Excel</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Price File</label>
              <input
                type="file"
                accept=".pdf,.csv,.txt,.xlsx,.xls"
                onChange={handleFile}
                className="w-full rounded-xl border bg-white px-3 py-2 text-slate-900 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-white"
              />
              {fileName ? <p className="mt-2 text-sm text-slate-700">Selected: {fileName}</p> : null}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleParse}
              disabled={parsing || saving}
              className="rounded-xl bg-slate-900 px-5 py-3 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {parsing ? 'Parsing…' : 'Parse Price File'}
            </button>

            <button
              type="button"
              onClick={handlePriceOnlySave}
              disabled={preview.length === 0 || saving || parsing}
              className="rounded-xl bg-blue-700 px-5 py-3 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {saving ? 'Applying…' : 'Apply Price Updates Only'}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={preview.length === 0 || saving || parsing}
              className="rounded-xl bg-green-700 px-5 py-3 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {saving ? 'Saving…' : 'Full Save + Create/Update L3s'}
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <strong>Use “Apply Price Updates Only” for normal supplier price-list updates.</strong>
            <br />
            This updates only pack price and unit price on matching supplier SKUs. It does not overwrite
            corrected names, pack sizes, weights, links, L3s, BOMs, or SOPs.
            <br />
            Use “Full Save + Create/Update L3s” only for first-time setup or when you intentionally want to
            create/link supplier products and L3 ingredients.
          </div>
        </section>

        <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Manually Add Supplier Product</h2>
          <p className="mt-1 text-sm text-slate-700">
            Use this for one-off products, missing supplier lines, or corrections without uploading a price file.
          </p>

          <form onSubmit={handleManualAddProduct} className="mt-5 grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Supplier</label>
              <input
                value={manualProduct.supplier}
                onChange={(e) =>
                  setManualProduct({
                    ...manualProduct,
                    supplier: e.target.value,
                  })
                }
                className="w-full rounded-xl border px-3 py-2 text-slate-900"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Supplier SKU</label>
              <input
                value={manualProduct.supplierSku}
                onChange={(e) =>
                  setManualProduct({
                    ...manualProduct,
                    supplierSku: e.target.value,
                  })
                }
                className="w-full rounded-xl border px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Product Name</label>
              <input
                value={manualProduct.name}
                onChange={(e) =>
                  setManualProduct({
                    ...manualProduct,
                    name: e.target.value,
                  })
                }
                className="w-full rounded-xl border px-3 py-2 text-slate-900"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Pack Size</label>
              <input
                value={manualProduct.packSize}
                onChange={(e) =>
                  setManualProduct({
                    ...manualProduct,
                    packSize: e.target.value,
                  })
                }
                placeholder="e.g. x6, case, box"
                className="w-full rounded-xl border px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Weight / Volume</label>
              <input
                value={manualProduct.weight}
                onChange={(e) =>
                  setManualProduct({
                    ...manualProduct,
                    weight: e.target.value,
                  })
                }
                placeholder="e.g. 200g, 1kg, 5L"
                className="w-full rounded-xl border px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Pack Price (€)</label>
              <input
                type="number"
                step="0.0001"
                value={manualProduct.packPrice}
                onChange={(e) =>
                  setManualProduct({
                    ...manualProduct,
                    packPrice: e.target.value,
                  })
                }
                className="w-full rounded-xl border px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Unit Price</label>
              <input
                type="number"
                step="0.000001"
                value={manualProduct.unitPrice}
                onChange={(e) =>
                  setManualProduct({
                    ...manualProduct,
                    unitPrice: e.target.value,
                  })
                }
                placeholder="€/g, €/ml, or €/each"
                className="w-full rounded-xl border px-3 py-2 text-slate-900"
              />
            </div>

            <div className="flex items-center gap-2 pt-7">
              <input
                id="createLinkedL3"
                type="checkbox"
                checked={manualProduct.createLinkedL3}
                onChange={(e) =>
                  setManualProduct({
                    ...manualProduct,
                    createLinkedL3: e.target.checked,
                  })
                }
              />
              <label htmlFor="createLinkedL3" className="text-sm text-slate-800">
                Create/link L3 automatically
              </label>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-slate-900 px-5 py-3 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {saving ? 'Saving…' : 'Add Supplier Product'}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-xl font-semibold text-slate-900">Import Preview</h2>
            <p className="mt-1 text-sm text-slate-700">
              Parsed rows: {preview.length}. Edit any row before saving.
            </p>
          </div>

          <div className="max-h-[70vh] overflow-auto">
            <table className="min-w-[1500px] w-full text-left">
              <thead className="bg-slate-100 text-sm">
                <tr>
                  <th className="px-4 py-3 text-slate-800">Status</th>
                  <th className="px-4 py-3 text-slate-800">SKU</th>
                  <th className="px-4 py-3 text-slate-800">Name</th>
                  <th className="px-4 py-3 text-slate-800">Pack</th>
                  <th className="px-4 py-3 text-slate-800">Weight</th>
                  <th className="px-4 py-3 text-slate-800">Pack Price</th>
                  <th className="px-4 py-3 text-slate-800">Unit Price</th>
                  <th className="px-4 py-3 text-slate-800">Reason</th>
                  <th className="sticky right-0 z-20 bg-slate-100 px-4 py-3 text-slate-800 shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.5)]">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {preview.length === 0 ? (
                  <tr className="border-t">
                    <td className="px-4 py-3 text-slate-700" colSpan={9}>
                      No parsed rows yet.
                    </td>
                  </tr>
                ) : (
                  preview.slice(0, 250).map((row, index) => (
                    <tr key={`${row.supplierSku}-${index}`} className="border-t align-top">
                      <td className="px-4 py-3 text-sm">
                        {row.status === 'review' ? (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">
                            Review
                          </span>
                        ) : (
                          <span className="rounded-full bg-green-100 px-2 py-1 text-green-800">
                            Ready
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <input
                          value={row.supplierSku ?? ''}
                          onChange={(e) => updatePreviewRow(index, 'supplierSku', e.target.value)}
                          className="w-32 rounded-lg border px-2 py-1 text-sm"
                        />
                      </td>

                      <td className="px-4 py-3">
                        <input
                          value={row.name}
                          onChange={(e) => updatePreviewRow(index, 'name', e.target.value)}
                          className="w-72 rounded-lg border px-2 py-1 text-sm"
                        />
                      </td>

                      <td className="px-4 py-3">
                        <input
                          value={row.packSize ?? ''}
                          onChange={(e) => updatePreviewRow(index, 'packSize', e.target.value)}
                          className="w-36 rounded-lg border px-2 py-1 text-sm"
                        />
                      </td>

                      <td className="px-4 py-3">
                        <input
                          value={row.weight ?? ''}
                          onChange={(e) => updatePreviewRow(index, 'weight', e.target.value)}
                          className="w-32 rounded-lg border px-2 py-1 text-sm"
                        />
                      </td>

                      <td className="px-4 py-3">
                        <input
                          type="number"
                          step="0.0001"
                          value={toInputValue(row.packPrice)}
                          onChange={(e) => updatePreviewRow(index, 'packPrice', e.target.value)}
                          className="w-28 rounded-lg border px-2 py-1 text-sm"
                        />
                      </td>

                      <td className="px-4 py-3">
                        <input
                          type="number"
                          step="0.000001"
                          value={toInputValue(row.unitPrice)}
                          onChange={(e) => updatePreviewRow(index, 'unitPrice', e.target.value)}
                          className="w-28 rounded-lg border px-2 py-1 text-sm"
                        />
                        <div className="mt-1 text-xs text-slate-500">{unitPriceLabel(row)}</div>
                      </td>

                      <td className="px-4 py-3 text-xs text-amber-700">
                        {row.reason ?? ''}
                        {row.raw ? (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-slate-500">Raw</summary>
                            <div className="mt-1 max-w-md whitespace-pre-wrap text-slate-500">
                              {row.raw}
                            </div>
                          </details>
                        ) : null}
                      </td>

                      <td className="sticky right-0 z-10 bg-white px-4 py-3 shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.5)]">
                        <div className="flex min-w-[140px] flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => removePreviewRow(index)}
                            className="rounded-lg border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {preview.length > 250 ? (
            <div className="border-t px-6 py-3 text-sm text-slate-600">
              Showing first 250 rows in the preview. All {preview.length} rows will still save unless
              removed.
            </div>
          ) : null}
        </section>

        {rejectedRows.length > 0 ? (
          <section className="mt-8 overflow-hidden rounded-2xl border border-amber-300 bg-amber-50 shadow-sm">
            <div className="border-b border-amber-300 px-6 py-4">
              <h2 className="text-xl font-semibold text-amber-900">Rejected Rows</h2>
              <p className="mt-1 text-sm text-amber-800">
                These were not included in the save list.
              </p>
            </div>

            <div className="max-h-96 overflow-auto">
              <table className="w-full text-left">
                <thead className="bg-amber-100 text-sm">
                  <tr>
                    <th className="px-4 py-3 text-amber-900">Reason</th>
                    <th className="px-4 py-3 text-amber-900">Raw</th>
                  </tr>
                </thead>
                <tbody>
                  {rejectedRows.slice(0, 100).map((row, index) => (
                    <tr key={index} className="border-t border-amber-200">
                      <td className="px-4 py-3 text-sm text-amber-900">{row.reason ?? ''}</td>
                      <td className="px-4 py-3 text-xs text-amber-900">{row.raw ?? row.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {loadingImpact ? (
          <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Price Import Impact</h2>
            <p className="mt-2 text-sm text-slate-700">Calculating affected L1 dishes…</p>
          </section>
        ) : null}

        {impactReport ? (
          <section className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-xl font-semibold text-slate-900">Price Import Impact</h2>
              <p className="mt-1 text-sm text-slate-700">
                {impactReport.importBatch.priceChangeCount} price change(s).{' '}
                {impactReport.affectedL1s.length} affected L1 dish(es).
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[1200px] w-full text-left">
                <thead className="bg-slate-100 text-sm">
                  <tr>
                    <th className="px-4 py-3 text-slate-800">Status</th>
                    <th className="px-4 py-3 text-slate-800">L1 Dish</th>
                    <th className="px-4 py-3 text-slate-800">Selling Price</th>
                    <th className="px-4 py-3 text-slate-800">Old COGS</th>
                    <th className="px-4 py-3 text-slate-800">New COGS</th>
                    <th className="px-4 py-3 text-slate-800">COGS Change</th>
                    <th className="px-4 py-3 text-slate-800">Old Margin</th>
                    <th className="px-4 py-3 text-slate-800">New Margin</th>
                    <th className="px-4 py-3 text-slate-800">Suggested Price</th>
                    <th className="px-4 py-3 text-slate-800">Changed Inputs</th>
                  </tr>
                </thead>

                <tbody>
                  {impactReport.affectedL1s.length === 0 ? (
                    <tr className="border-t">
                      <td className="px-4 py-3 text-slate-700" colSpan={10}>
                        No L1 dishes were affected by this import.
                      </td>
                    </tr>
                  ) : (
                    impactReport.affectedL1s.map((row) => (
                      <tr key={row.itemId} className="border-t align-top">
                        <td className="px-4 py-3 text-slate-800">{statusLabel(row.status)}</td>

                        <td className="px-4 py-3 text-slate-800">
                          <div className="font-medium">{row.name}</div>
                          <div className="text-xs text-slate-500">{row.sku}</div>
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          {row.sellingPrice === null ? '' : money(row.sellingPrice, 2)}
                        </td>

                        <td className="px-4 py-3 text-slate-800">{money(row.oldCogs, 4)}</td>
                        <td className="px-4 py-3 text-slate-800">{money(row.newCogs, 4)}</td>

                        <td className="px-4 py-3 text-slate-800">
                          {row.cogsChange >= 0 ? '+' : ''}
                          {money(row.cogsChange, 4)}
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          {formatPercent(row.oldGrossMarginPercent)}
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          {formatPercent(row.newGrossMarginPercent)}
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          {row.suggestedSellingPriceAtTargetMargin
                            ? money(row.suggestedSellingPriceAtTargetMargin, 2)
                            : ''}
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          <details>
                            <summary className="cursor-pointer text-sm text-slate-700">
                              {row.changedInputs.length} changed input(s)
                            </summary>

                            <div className="mt-2 space-y-2">
                              {row.changedInputs.map((input, index) => (
                                <div
                                  key={index}
                                  className="rounded-lg border bg-slate-50 p-2 text-xs"
                                >
                                  <div className="font-medium text-slate-900">
                                    {input.l3Name || input.supplierProductName}
                                  </div>

                                  <div className="text-slate-600">
                                    SKU: {input.l3Sku || input.supplierSku || 'N/A'}
                                  </div>

                                  <div className="text-slate-600">
                                    Supplier: {input.supplier}
                                  </div>

                                  <div className="text-slate-600">
                                    Unit price: {money(input.oldUnitPrice, 6)} →{' '}
                                    {money(input.newUnitPrice, 6)}
                                  </div>

                                  <div className="text-slate-600">
                                    Pack price: {money(input.oldPackPrice, 2)} →{' '}
                                    {money(input.newPackPrice, 2)}
                                  </div>

                                  <div className="text-slate-600">
                                    Used in:{' '}
                                    {input.usedIn === 'DIRECT_L1_L3'
                                      ? 'Direct L1 ingredient'
                                      : `L2 ${input.l2Name || ''}`}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </details>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Saved Supplier Products</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product, SKU, L3..."
              className="rounded-xl border px-3 py-2 text-slate-900"
            />

            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="rounded-xl border px-3 py-2 text-slate-900"
            >
              <option value="ALL">All suppliers</option>
              {suppliers.map((supplierName) => (
                <option key={supplierName} value={supplierName}>
                  {supplierName}
                </option>
              ))}
            </select>

            <select
              value={linkFilter}
              onChange={(e) => setLinkFilter(e.target.value)}
              className="rounded-xl border px-3 py-2 text-slate-900"
            >
              <option value="ALL">All</option>
              <option value="LINKED">Linked</option>
              <option value="UNLINKED">Unlinked</option>
            </select>
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-xl font-semibold text-slate-900">Product Catalogue</h2>
            <p className="mt-1 text-sm text-slate-700">
              Showing {visibleProducts.length} of {filteredProducts.length} filtered products.
            </p>
          </div>

          <div className="max-h-[75vh] overflow-auto">
            <table className="min-w-[1500px] w-full text-left">
              <thead className="bg-slate-100 text-sm">
                <tr>
                  <th className="px-4 py-3 text-slate-800">Supplier Product</th>
                  <th className="px-4 py-3 text-slate-800">SKU</th>
                  <th className="px-4 py-3 text-slate-800">Pack</th>
                  <th className="px-4 py-3 text-slate-800">Weight</th>
                  <th className="px-4 py-3 text-slate-800">Pack Price</th>
                  <th className="px-4 py-3 text-slate-800">Unit Price</th>
                  <th className="px-4 py-3 text-slate-800">Linked L3</th>
                  <th className="px-4 py-3 text-slate-800">Updated</th>
                  <th className="sticky right-0 z-20 bg-slate-100 px-4 py-3 text-slate-800 shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.5)]">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {visibleProducts.length === 0 ? (
                  <tr className="border-t">
                    <td className="px-4 py-3 text-slate-700" colSpan={9}>
                      No supplier products found.
                    </td>
                  </tr>
                ) : (
                  visibleProducts.map((product) => {
                    const isEditingProduct = editingProductId === product.id
                    const isEditingL3 =
                      Boolean(product.linkedItem) && editingL3Id === product.linkedItem?.id

                    return (
                      <tr key={product.id} className="border-t align-top">
                        <td className="px-4 py-3 text-slate-800">
                          {isEditingProduct && editingProduct ? (
                            <div className="space-y-2">
                              <input
                                value={editingProduct.name}
                                onChange={(e) =>
                                  setEditingProduct({ ...editingProduct, name: e.target.value })
                                }
                                className="w-56 rounded-lg border px-2 py-1 text-sm"
                              />
                              <input
                                value={editingProduct.supplier}
                                onChange={(e) =>
                                  setEditingProduct({
                                    ...editingProduct,
                                    supplier: e.target.value,
                                  })
                                }
                                className="w-40 rounded-lg border px-2 py-1 text-sm"
                              />
                            </div>
                          ) : (
                            <>
                              <div className="font-medium">{product.name}</div>
                              <div className="text-xs text-slate-600">{product.supplier}</div>
                            </>
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          {isEditingProduct && editingProduct ? (
                            <input
                              value={editingProduct.supplierSku}
                              onChange={(e) =>
                                setEditingProduct({
                                  ...editingProduct,
                                  supplierSku: e.target.value,
                                })
                              }
                              className="w-32 rounded-lg border px-2 py-1 text-sm"
                            />
                          ) : (
                            product.supplierSku ?? ''
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          {isEditingProduct && editingProduct ? (
                            <input
                              value={editingProduct.packSize}
                              onChange={(e) =>
                                setEditingProduct({
                                  ...editingProduct,
                                  packSize: e.target.value,
                                })
                              }
                              className="w-36 rounded-lg border px-2 py-1 text-sm"
                            />
                          ) : (
                            product.packSize ?? ''
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          {isEditingProduct && editingProduct ? (
                            <input
                              value={editingProduct.weight}
                              onChange={(e) =>
                                setEditingProduct({
                                  ...editingProduct,
                                  weight: e.target.value,
                                })
                              }
                              className="w-32 rounded-lg border px-2 py-1 text-sm"
                            />
                          ) : (
                            product.weight ?? ''
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          {isEditingProduct && editingProduct ? (
                            <input
                              type="number"
                              step="0.0001"
                              value={editingProduct.packPrice}
                              onChange={(e) =>
                                setEditingProduct({
                                  ...editingProduct,
                                  packPrice: e.target.value,
                                })
                              }
                              className="w-28 rounded-lg border px-2 py-1 text-sm"
                            />
                          ) : (
                            money(product.packPrice, 2)
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          {isEditingProduct && editingProduct ? (
                            <input
                              type="number"
                              step="0.000001"
                              value={editingProduct.unitPrice}
                              onChange={(e) =>
                                setEditingProduct({
                                  ...editingProduct,
                                  unitPrice: e.target.value,
                                })
                              }
                              className="w-28 rounded-lg border px-2 py-1 text-sm"
                            />
                          ) : (
                            unitPriceLabel(product)
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          {product.linkedItem ? (
                            isEditingL3 && editingL3 ? (
                              <div className="space-y-2">
                                <input
                                  value={editingL3.sku}
                                  onChange={(e) =>
                                    setEditingL3({ ...editingL3, sku: e.target.value })
                                  }
                                  className="w-40 rounded-lg border px-2 py-1 text-sm"
                                  placeholder="L3 SKU"
                                />

                                <input
                                  value={editingL3.name}
                                  onChange={(e) =>
                                    setEditingL3({ ...editingL3, name: e.target.value })
                                  }
                                  className="w-64 rounded-lg border px-2 py-1 text-sm"
                                  placeholder="L3 name"
                                />

                                <div className="flex gap-2">
                                  <select
                                    value={editingL3.unitType}
                                    onChange={(e) =>
                                      setEditingL3({
                                        ...editingL3,
                                        unitType: e.target.value as UnitType,
                                      })
                                    }
                                    className="rounded-lg border px-2 py-1 text-sm"
                                  >
                                    <option value="g">g</option>
                                    <option value="ml">ml</option>
                                    <option value="each">each</option>
                                  </select>

                                  <input
                                    type="number"
                                    step="1"
                                    value={editingL3.shelfLifeDays}
                                    onChange={(e) =>
                                      setEditingL3({
                                        ...editingL3,
                                        shelfLifeDays: e.target.value,
                                      })
                                    }
                                    className="w-24 rounded-lg border px-2 py-1 text-sm"
                                    placeholder="Shelf"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div className="font-medium text-green-700">
                                  {product.linkedItem.name}
                                </div>
                                <div className="text-xs text-slate-600">
                                  {product.linkedItem.sku} · {product.linkedItem.unitType} · shelf{' '}
                                  {product.linkedItem.shelfLifeDays ?? 'N/A'} days
                                </div>
                              </div>
                            )
                          ) : (
                            <span className="text-red-700">Not linked</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          {formatDate(product.createdAt)}
                        </td>

                        <td className="sticky right-0 z-10 bg-white px-4 py-3 shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.5)]">
                          <div className="flex min-w-[140px] flex-col gap-2">
                            {isEditingProduct ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => saveProductEdit(product.id)}
                                  className="rounded-lg border border-green-300 px-3 py-1 text-sm text-green-700 hover:bg-green-50"
                                >
                                  Save Product
                                </button>

                                <button
                                  type="button"
                                  onClick={cancelEditProduct}
                                  className="rounded-lg border px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  Cancel Product
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEditProduct(product)}
                                className="rounded-lg border px-3 py-1 text-sm text-slate-800 hover:bg-slate-50"
                              >
                                Edit Product
                              </button>
                            )}

                            {product.linkedItem ? (
                              isEditingL3 ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => saveL3Edit(product.linkedItem!.id)}
                                    className="rounded-lg border border-green-300 px-3 py-1 text-sm text-green-700 hover:bg-green-50"
                                  >
                                    Save L3
                                  </button>

                                  <button
                                    type="button"
                                    onClick={cancelEditL3}
                                    className="rounded-lg border px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
                                  >
                                    Cancel L3
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startEditL3(product.linkedItem!)}
                                  className="rounded-lg border border-blue-300 px-3 py-1 text-sm text-blue-700 hover:bg-blue-50"
                                >
                                  Edit L3
                                </button>
                              )
                            ) : null}

                            {!isEditingProduct && !isEditingL3 ? (
                              <button
                                type="button"
                                onClick={() => deleteProduct(product)}
                                className="rounded-lg border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
                              >
                                Delete Product
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}