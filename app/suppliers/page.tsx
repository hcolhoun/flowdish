'use client'

import { useEffect, useMemo, useState } from 'react'

type Item = {
  id: string
  sku: string
  name: string
  itemType: 'L1' | 'L2' | 'L3'
  unitType: 'g' | 'ml' | 'each'
  shelfLifeDays: number | null
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
}

type RejectedImportRow = ImportRow & {
  reason: string
  raw: string
  include: boolean
}

function emptyRejectedRow(): RejectedImportRow {
  return {
    supplier: 'Caterway',
    supplierSku: '',
    name: '',
    packSize: '',
    weight: '',
    packPrice: null,
    unitPrice: null,
    reason: 'Manual row',
    raw: '',
    include: true,
  }
}

export default function SuppliersPage() {
  const [supplier, setSupplier] = useState('Caterway')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportRow[]>([])
  const [rejectedRows, setRejectedRows] = useState<RejectedImportRow[]>([])
  const [products, setProducts] = useState<SupplierProduct[]>([])
  const [search, setSearch] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('ALL')
  const [linkFilter, setLinkFilter] = useState('ALL')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)

  const busy = saving || parsing

  async function safeJson(res: Response) {
    const text = await res.text()

    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 1000))
    }
  }

  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      if (!busy) return

      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', beforeUnload)

    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [busy])

  async function loadProducts() {
    try {
      setError('')

      const res = await fetch('/api/supplier-products', { cache: 'no-store' })
      const data = await safeJson(res)

      if (!res.ok) throw new Error(data?.error || 'Failed to load supplier products')

      setProducts(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
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

      const matchesSupplier =
        supplierFilter === 'ALL' || product.supplier === supplierFilter

      const matchesLink =
        linkFilter === 'ALL' ||
        (linkFilter === 'LINKED' && product.linkedItemId) ||
        (linkFilter === 'UNLINKED' && !product.linkedItemId)

      return matchesSearch && matchesSupplier && matchesLink
    })
  }, [products, search, supplierFilter, linkFilter])

  function money(value: number | null | undefined) {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 4,
    }).format(value ?? 0)
  }

  function normaliseNullableString(value: string | null | undefined) {
    const trimmed = String(value ?? '').trim()
    return trimmed.length > 0 ? trimmed : null
  }

  function toNullableNumber(value: string | number | null | undefined) {
    if (value === null || value === undefined || value === '') return null

    const number = Number(value)
    return Number.isFinite(number) ? number : null
  }

  function cleanRowForSave(row: ImportRow): ImportRow {
    return {
      supplier: String(row.supplier || supplier || 'Caterway').trim(),
      supplierSku: normaliseNullableString(row.supplierSku),
      name: String(row.name || '').trim(),
      packSize: normaliseNullableString(row.packSize),
      weight: normaliseNullableString(row.weight),
      packPrice: toNullableNumber(row.packPrice),
      unitPrice: toNullableNumber(row.unitPrice),
    }
  }

  function validManualRow(row: RejectedImportRow) {
    return (
      row.include &&
      String(row.supplierSku || '').trim().length > 0 &&
      String(row.name || '').trim().length > 0 &&
      Number(row.packPrice) > 0
    )
  }

  function rowsToSave() {
    const cleanPreview = preview.map(cleanRowForSave)

    const manuallyAcceptedRejected = rejectedRows
      .filter(validManualRow)
      .map(cleanRowForSave)

    return [...cleanPreview, ...manuallyAcceptedRejected]
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError('')
    setMessage('')
    setPreview([])
    setRejectedRows([])
    setSelectedFile(null)
    setFileName('')

    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFile(file)
    setFileName(file.name)
    setMessage(`File selected: ${file.name}. Click "Parse Price File" next.`)
  }

  async function handleParse() {
    try {
      setError('')
      setMessage('')
      setPreview([])
      setRejectedRows([])
      setParsing(true)

      if (!selectedFile) {
        setError('Choose a file first.')
        return
      }

      if (supplier !== 'Caterway') {
        setError('Sysco Excel import should be built as a separate parser. Caterway PDF parser is selected now.')
        return
      }

      const formData = new FormData()
      formData.append('file', selectedFile)

      const res = await fetch('/api/parse-caterway', {
        method: 'POST',
        body: formData,
      })

      const data = await safeJson(res)

      if (!res.ok) {
        const debugText = data?.debug
          ? `\n\nDEBUG:\n${JSON.stringify(data.debug, null, 2)}`
          : ''

        throw new Error((data?.error || 'Failed to parse file') + debugText)
      }

      const parsedProducts = Array.isArray(data)
        ? data
        : Array.isArray(data.products)
          ? data.products
          : []

      const rejected = Array.isArray(data.rejectedRows)
        ? data.rejectedRows.map((row: any) => ({
            supplier: String(row.supplier || supplier || 'Caterway'),
            supplierSku: row.supplierSku ?? '',
            name: row.name ?? '',
            packSize: row.packSize ?? '',
            weight: row.weight ?? '',
            packPrice: row.packPrice ?? null,
            unitPrice: row.unitPrice ?? null,
            reason: row.reason ?? 'Rejected by parser',
            raw: row.raw ?? '',
            include: false,
          }))
        : []

      setPreview(parsedProducts)
      setRejectedRows(rejected)

      if (parsedProducts.length === 0 && rejected.length === 0) {
        setError('No rows were parsed from the file.')
        return
      }

      setMessage(
        `${parsedProducts.length} clean rows parsed. ${rejected.length} rejected rows available for manual review.`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setParsing(false)
    }
  }

  async function handleSave() {
    try {
      setError('')
      setMessage('')
      setSaving(true)

      const productsToSave = rowsToSave()

      if (productsToSave.length === 0) {
        setError('No products to save. Parse a file first or include corrected rejected rows.')
        return
      }

      setMessage('Saving supplier products and creating/updating L3 items. Do not leave this page...')

      const res = await fetch('/api/supplier-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: productsToSave }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save supplier products')
      }

      setMessage(
        `Import complete. Created: ${data.createdCount ?? 0}. Updated: ${
          data.updatedCount ?? 0
        }. Linked: ${data.linkedCount ?? 0}. Skipped: ${
          data.skippedCount ?? 0
        }. Duplicates in upload: ${data.duplicateInUploadCount ?? data.duplicateCount ?? 0}.`
      )

      setPreview([])
      setRejectedRows([])
      setSelectedFile(null)
      setFileName('')
      await loadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  function updateRejectedRow(
    index: number,
    field: keyof RejectedImportRow,
    value: string | boolean
  ) {
    setRejectedRows((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex !== index) return row

        if (field === 'include') {
          return { ...row, include: Boolean(value) }
        }

        if (field === 'packPrice' || field === 'unitPrice') {
          return {
            ...row,
            [field]: value === '' ? null : Number(value),
          }
        }

        return {
          ...row,
          [field]: String(value),
        }
      })
    )
  }

  function addManualRow() {
    setRejectedRows((prev) => [emptyRejectedRow(), ...prev])
  }

  function removeRejectedRow(index: number) {
    setRejectedRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))
  }

  const visibleProducts = filteredProducts.slice(0, 100)
  const saveCount = rowsToSave().length

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-semibold text-slate-900">Supplier Products</h1>

        <p className="mt-2 text-slate-800">
          Upload supplier price lists, create L3 items, and link supplier products to kitchen ingredients.
        </p>

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

        {busy ? (
          <div className="mt-4 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {parsing ? 'Parsing file. Please wait...' : 'Saving import. Please wait and do not leave the page...'}
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
                  setSupplier(e.target.value)
                  setPreview([])
                  setRejectedRows([])
                  setError('')
                  setMessage('')
                }}
                className="w-full rounded-xl border px-3 py-2 text-slate-900"
                disabled={busy}
              >
                <option value="Caterway">Caterway PDF</option>
                <option value="Sysco">Sysco Excel - parser pending</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Price File</label>
              <input
                type="file"
                accept=".pdf,.csv,.txt,.xlsx,.xls"
                onChange={handleFile}
                disabled={busy}
                className="w-full rounded-xl border bg-white px-3 py-2 text-slate-900 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-white disabled:opacity-60"
              />
              {fileName ? (
                <p className="mt-2 text-sm text-slate-700">Selected: {fileName}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleParse}
              disabled={parsing || saving || !selectedFile}
              className="rounded-xl bg-slate-900 px-5 py-3 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {parsing ? 'Parsing...' : 'Parse Price File'}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saveCount === 0 || saving || parsing}
              className="rounded-xl bg-green-700 px-5 py-3 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {saving ? 'Saving...' : `Save ${saveCount} Product${saveCount === 1 ? '' : 's'} + Create/Update L3s`}
            </button>

            <button
              type="button"
              onClick={addManualRow}
              disabled={busy}
              className="rounded-xl border px-5 py-3 text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add Manual Row
            </button>
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-xl font-semibold text-slate-900">Import Preview</h2>
            <p className="mt-1 text-sm text-slate-700">
              Clean parsed rows: {preview.length}. Showing first 100 rows.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-100 text-sm">
                <tr>
                  <th className="px-4 py-3 text-slate-800">Supplier</th>
                  <th className="px-4 py-3 text-slate-800">Name</th>
                  <th className="px-4 py-3 text-slate-800">Weight</th>
                  <th className="px-4 py-3 text-slate-800">Pack Price</th>
                  <th className="px-4 py-3 text-slate-800">Unit Price</th>
                  <th className="px-4 py-3 text-slate-800">Supplier SKU</th>
                </tr>
              </thead>

              <tbody>
                {preview.length === 0 ? (
                  <tr className="border-t">
                    <td className="px-4 py-3 text-slate-700" colSpan={6}>
                      No clean rows parsed yet.
                    </td>
                  </tr>
                ) : (
                  preview.slice(0, 100).map((product, index) => (
                    <tr key={`${product.supplierSku}-${index}`} className="border-t">
                      <td className="px-4 py-3 text-slate-800">{product.supplier}</td>
                      <td className="px-4 py-3 text-slate-800">{product.name}</td>
                      <td className="px-4 py-3 text-slate-800">{product.weight ?? ''}</td>
                      <td className="px-4 py-3 text-slate-800">{money(product.packPrice)}</td>
                      <td className="px-4 py-3 text-slate-800">
                        {product.unitPrice ? money(product.unitPrice) : ''}
                      </td>
                      <td className="px-4 py-3 text-slate-800">{product.supplierSku ?? ''}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-xl font-semibold text-slate-900">Rejected / Manual Review Rows</h2>
            <p className="mt-1 text-sm text-slate-700">
              Edit any rejected row, tick Include, then save. Rows need at least supplier SKU, name, and pack price.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-left">
              <thead className="bg-slate-100 text-sm">
                <tr>
                  <th className="px-4 py-3 text-slate-800">Include</th>
                  <th className="px-4 py-3 text-slate-800">Reason</th>
                  <th className="px-4 py-3 text-slate-800">SKU</th>
                  <th className="px-4 py-3 text-slate-800">Name</th>
                  <th className="px-4 py-3 text-slate-800">Pack</th>
                  <th className="px-4 py-3 text-slate-800">Weight</th>
                  <th className="px-4 py-3 text-slate-800">Pack Price</th>
                  <th className="px-4 py-3 text-slate-800">Unit Price</th>
                  <th className="px-4 py-3 text-slate-800">Raw</th>
                  <th className="px-4 py-3 text-slate-800">Actions</th>
                </tr>
              </thead>

              <tbody>
                {rejectedRows.length === 0 ? (
                  <tr className="border-t">
                    <td className="px-4 py-3 text-slate-700" colSpan={10}>
                      No rejected rows.
                    </td>
                  </tr>
                ) : (
                  rejectedRows.map((row, index) => (
                    <tr key={`${row.raw}-${index}`} className="border-t align-top">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={row.include}
                          onChange={(e) => updateRejectedRow(index, 'include', e.target.checked)}
                          disabled={busy}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-red-700">{row.reason}</td>
                      <td className="px-4 py-3">
                        <input
                          value={row.supplierSku ?? ''}
                          onChange={(e) => updateRejectedRow(index, 'supplierSku', e.target.value)}
                          disabled={busy}
                          className="w-32 rounded-lg border px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          value={row.name ?? ''}
                          onChange={(e) => updateRejectedRow(index, 'name', e.target.value)}
                          disabled={busy}
                          className="w-72 rounded-lg border px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          value={row.packSize ?? ''}
                          onChange={(e) => updateRejectedRow(index, 'packSize', e.target.value)}
                          disabled={busy}
                          className="w-28 rounded-lg border px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          value={row.weight ?? ''}
                          onChange={(e) => updateRejectedRow(index, 'weight', e.target.value)}
                          disabled={busy}
                          className="w-28 rounded-lg border px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          step="0.0001"
                          value={row.packPrice ?? ''}
                          onChange={(e) => updateRejectedRow(index, 'packPrice', e.target.value)}
                          disabled={busy}
                          className="w-28 rounded-lg border px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          step="0.000001"
                          value={row.unitPrice ?? ''}
                          onChange={(e) => updateRejectedRow(index, 'unitPrice', e.target.value)}
                          disabled={busy}
                          className="w-28 rounded-lg border px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="max-w-md px-4 py-3 text-xs text-slate-600">
                        <div className="max-h-20 overflow-auto whitespace-pre-wrap">{row.raw}</div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => removeRejectedRow(index)}
                          disabled={busy}
                          className="rounded-lg border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

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

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-100 text-sm">
                <tr>
                  <th className="px-4 py-3 text-slate-800">Supplier Product</th>
                  <th className="px-4 py-3 text-slate-800">SKU</th>
                  <th className="px-4 py-3 text-slate-800">Pack</th>
                  <th className="px-4 py-3 text-slate-800">Pack Price</th>
                  <th className="px-4 py-3 text-slate-800">Unit Price</th>
                  <th className="px-4 py-3 text-slate-800">Linked L3</th>
                </tr>
              </thead>

              <tbody>
                {visibleProducts.length === 0 ? (
                  <tr className="border-t">
                    <td className="px-4 py-3 text-slate-700" colSpan={6}>
                      No supplier products found.
                    </td>
                  </tr>
                ) : (
                  visibleProducts.map((product) => (
                    <tr key={product.id} className="border-t">
                      <td className="px-4 py-3 text-slate-800">
                        <div className="font-medium">{product.name}</div>
                        <div className="text-xs text-slate-600">{product.supplier}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-800">{product.supplierSku ?? ''}</td>
                      <td className="px-4 py-3 text-slate-800">
                        {[product.packSize, product.weight].filter(Boolean).join(' / ')}
                      </td>
                      <td className="px-4 py-3 text-slate-800">{money(product.packPrice)}</td>
                      <td className="px-4 py-3 text-slate-800">
                        {product.unitPrice === null || product.unitPrice === undefined
                          ? ''
                          : money(product.unitPrice)}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {product.linkedItem ? (
                          <span className="text-green-700">
                            {product.linkedItem.name} [{product.linkedItem.sku}]
                          </span>
                        ) : (
                          <span className="text-red-700">Not linked</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}