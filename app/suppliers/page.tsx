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
  raw?: string
  reason?: string
}

type ParseResult = {
  ready: ImportRow[]
  needsReview: ImportRow[]
  rejected: ImportRow[]
  debug?: unknown
}

function emptyParseResult(): ParseResult {
  return {
    ready: [],
    needsReview: [],
    rejected: [],
  }
}

function normaliseParsedResponse(data: unknown): ParseResult {
  if (Array.isArray(data)) {
    return {
      ready: data as ImportRow[],
      needsReview: [],
      rejected: [],
    }
  }

  if (data && typeof data === 'object') {
    const value = data as {
      ready?: ImportRow[]
      products?: ImportRow[]
      needsReview?: ImportRow[]
      review?: ImportRow[]
      rejected?: ImportRow[]
      rejectedRows?: ImportRow[]
      debug?: unknown
    }

    return {
      ready: value.ready ?? value.products ?? [],
      needsReview: value.needsReview ?? value.review ?? [],
      rejected: value.rejected ?? value.rejectedRows ?? [],
      debug: value.debug,
    }
  }

  return emptyParseResult()
}

function numberInputValue(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  return String(value)
}

function cleanNullable(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export default function SuppliersPage() {
  const [supplier, setSupplier] = useState('Caterway')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')

  const [parseResult, setParseResult] = useState<ParseResult>(emptyParseResult())
  const [products, setProducts] = useState<SupplierProduct[]>([])

  const [search, setSearch] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('ALL')
  const [linkFilter, setLinkFilter] = useState('ALL')

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)

  async function safeJson(res: Response) {
    const text = await res.text()

    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 1000))
    }
  }

  function money(value: number | null | undefined) {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 4,
    }).format(value ?? 0)
  }

  async function loadProducts() {
    try {
      setError('')

      const res = await fetch('/api/supplier-products', { cache: 'no-store' })
      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load supplier products')
      }

      setProducts(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

  const suppliers = useMemo(() => {
    return Array.from(new Set(products.map((product) => product.supplier))).sort()
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

  const visibleProducts = filteredProducts.slice(0, 100)

  const totalParsedRows =
    parseResult.ready.length + parseResult.needsReview.length + parseResult.rejected.length

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError('')
    setMessage('')
    setParseResult(emptyParseResult())
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
      setParseResult(emptyParseResult())
      setParsing(true)

      if (!selectedFile) {
        setError('Choose a file first.')
        return
      }

      if (supplier !== 'Caterway') {
        setError('Sysco parser is not built yet. Use Caterway PDFs for now.')
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
          ? `\n\nDebug:\n${JSON.stringify(data.debug, null, 2).slice(0, 3000)}`
          : ''

        throw new Error(`${data?.error || 'Failed to parse file'}${debugText}`)
      }

      const normalised = normaliseParsedResponse(data)
      setParseResult(normalised)

      const count =
        normalised.ready.length + normalised.needsReview.length + normalised.rejected.length

      if (count === 0) {
        setError('No rows were parsed from the file.')
        return
      }

      setMessage(
        `${normalised.ready.length} clean row(s) parsed. ${normalised.needsReview.length} row(s) need review. ${normalised.rejected.length} row(s) rejected.`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setParsing(false)
    }
  }

  function updateReadyRow(index: number, field: keyof ImportRow, value: string) {
    setParseResult((prev) => {
      const next = [...prev.ready]
      const row = { ...next[index] }

      if (field === 'supplier') row.supplier = value
      if (field === 'supplierSku') row.supplierSku = cleanNullable(value)
      if (field === 'name') row.name = value
      if (field === 'packSize') row.packSize = cleanNullable(value)
      if (field === 'weight') row.weight = cleanNullable(value)
      if (field === 'packPrice') row.packPrice = value === '' ? null : Number(value)
      if (field === 'unitPrice') row.unitPrice = value === '' ? null : Number(value)
      if (field === 'raw') row.raw = value
      if (field === 'reason') row.reason = value

      next[index] = row

      return {
        ...prev,
        ready: next,
      }
    })
  }

  function updateReviewRow(index: number, field: keyof ImportRow, value: string) {
    setParseResult((prev) => {
      const next = [...prev.needsReview]
      const row = { ...next[index] }

      if (field === 'supplier') row.supplier = value
      if (field === 'supplierSku') row.supplierSku = cleanNullable(value)
      if (field === 'name') row.name = value
      if (field === 'packSize') row.packSize = cleanNullable(value)
      if (field === 'weight') row.weight = cleanNullable(value)
      if (field === 'packPrice') row.packPrice = value === '' ? null : Number(value)
      if (field === 'unitPrice') row.unitPrice = value === '' ? null : Number(value)
      if (field === 'raw') row.raw = value
      if (field === 'reason') row.reason = value

      next[index] = row

      return {
        ...prev,
        needsReview: next,
      }
    })
  }

  function removeReadyRow(index: number) {
    setParseResult((prev) => ({
      ...prev,
      ready: prev.ready.filter((_, rowIndex) => rowIndex !== index),
    }))
  }

  function removeReviewRow(index: number) {
    setParseResult((prev) => ({
      ...prev,
      needsReview: prev.needsReview.filter((_, rowIndex) => rowIndex !== index),
    }))
  }

  function approveReviewRow(index: number) {
    setParseResult((prev) => {
      const row = prev.needsReview[index]
      if (!row) return prev

      return {
        ...prev,
        ready: [...prev.ready, { ...row, reason: undefined }],
        needsReview: prev.needsReview.filter((_, rowIndex) => rowIndex !== index),
      }
    })
  }

  function approveAllReviewRows() {
    setParseResult((prev) => ({
      ...prev,
      ready: [
        ...prev.ready,
        ...prev.needsReview.map((row) => ({
          ...row,
          reason: undefined,
        })),
      ],
      needsReview: [],
    }))
  }

  function validateRows(rows: ImportRow[]) {
    const validRows: ImportRow[] = []

    for (const row of rows) {
      const supplierValue = row.supplier?.trim()
      const nameValue = row.name?.trim()
      const skuValue = row.supplierSku?.trim() || null
      const packPriceValue = row.packPrice

      if (!supplierValue) continue
      if (!nameValue) continue
      if (!packPriceValue || packPriceValue <= 0 || Number.isNaN(packPriceValue)) continue

      validRows.push({
        supplier: supplierValue,
        supplierSku: skuValue,
        name: nameValue,
        packSize: row.packSize?.trim() || null,
        weight: row.weight?.trim() || null,
        packPrice: packPriceValue,
        unitPrice:
          row.unitPrice === null || row.unitPrice === undefined || Number.isNaN(row.unitPrice)
            ? null
            : row.unitPrice,
      })
    }

    return validRows
  }

  async function handleSave() {
    try {
      setError('')
      setMessage('')
      setSaving(true)

      const validRows = validateRows(parseResult.ready)

      if (validRows.length === 0) {
        setError('No valid parsed rows to save. Check supplier, name, SKU, and pack price.')
        return
      }

      if (parseResult.needsReview.length > 0) {
        const confirmed = window.confirm(
          `${parseResult.needsReview.length} row(s) still need review and will NOT be saved. Continue saving only clean rows?`
        )

        if (!confirmed) return
      }

      setMessage('Saving supplier products and creating/updating L3 items. Please wait...')

      const res = await fetch('/api/supplier-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: validRows }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save supplier products')
      }

      setMessage(
        `${validRows.length} supplier product row(s) saved. ${
          data.linkedCount ?? 0
        } linked to L3 items.`
      )

      setParseResult(emptyParseResult())
      setSelectedFile(null)
      setFileName('')
      await loadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  function renderEditableRow({
    row,
    index,
    mode,
  }: {
    row: ImportRow
    index: number
    mode: 'ready' | 'review'
  }) {
    const update = mode === 'ready' ? updateReadyRow : updateReviewRow
    const remove = mode === 'ready' ? removeReadyRow : removeReviewRow

    return (
      <tr key={`${mode}-${index}`} className="border-t align-top">
        <td className="px-3 py-3">
          <input
            value={row.supplierSku ?? ''}
            onChange={(e) => update(index, 'supplierSku', e.target.value)}
            className="w-32 rounded-lg border px-2 py-1 text-sm"
            placeholder="SKU"
          />
        </td>

        <td className="px-3 py-3">
          <input
            value={row.name ?? ''}
            onChange={(e) => update(index, 'name', e.target.value)}
            className="min-w-[260px] rounded-lg border px-2 py-1 text-sm"
            placeholder="Name"
          />
          {mode === 'review' && row.reason ? (
            <div className="mt-1 text-xs text-amber-700">{row.reason}</div>
          ) : null}
        </td>

        <td className="px-3 py-3">
          <input
            value={row.packSize ?? ''}
            onChange={(e) => update(index, 'packSize', e.target.value)}
            className="w-28 rounded-lg border px-2 py-1 text-sm"
            placeholder="Pack"
          />
        </td>

        <td className="px-3 py-3">
          <input
            value={row.weight ?? ''}
            onChange={(e) => update(index, 'weight', e.target.value)}
            className="w-28 rounded-lg border px-2 py-1 text-sm"
            placeholder="Weight"
          />
        </td>

        <td className="px-3 py-3">
          <input
            type="number"
            step="0.0001"
            value={numberInputValue(row.packPrice)}
            onChange={(e) => update(index, 'packPrice', e.target.value)}
            className="w-28 rounded-lg border px-2 py-1 text-sm"
            placeholder="Pack €"
          />
        </td>

        <td className="px-3 py-3">
          <input
            type="number"
            step="0.000001"
            value={numberInputValue(row.unitPrice)}
            onChange={(e) => update(index, 'unitPrice', e.target.value)}
            className="w-28 rounded-lg border px-2 py-1 text-sm"
            placeholder="Unit €"
          />
        </td>

        <td className="px-3 py-3">
          <div className="flex flex-wrap gap-2">
            {mode === 'review' ? (
              <button
                type="button"
                onClick={() => approveReviewRow(index)}
                className="rounded-lg border border-green-300 px-3 py-1 text-sm text-green-700 hover:bg-green-50"
              >
                Approve
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => remove(index)}
              className="rounded-lg border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
            >
              Remove
            </button>
          </div>

          {row.raw ? (
            <details className="mt-2 text-xs text-slate-600">
              <summary className="cursor-pointer">Raw</summary>
              <div className="mt-1 max-w-md whitespace-pre-wrap rounded-lg bg-slate-50 p-2">
                {row.raw}
              </div>
            </details>
          ) : null}
        </td>
      </tr>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-semibold text-slate-900">Supplier Products</h1>

        <p className="mt-2 text-slate-800">
          Upload supplier price lists, review parsed rows, create L3 items, and keep supplier prices
          current.
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

        {saving ? (
          <div className="mt-4 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            Saving products and creating/updating L3 items. Do not leave this page until it
            finishes.
          </div>
        ) : null}

        <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Upload Price List</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Supplier</label>
              <select
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-slate-900"
              >
                <option value="Caterway">Caterway</option>
                <option value="Sysco">Sysco</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Price File</label>
              <input
                type="file"
                accept=".pdf,.csv,.xlsx,.xls,.txt"
                onChange={handleFile}
                className="w-full rounded-xl border bg-white px-3 py-2 text-slate-900 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-white"
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
              disabled={parsing || saving}
              className="rounded-xl bg-slate-900 px-5 py-3 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {parsing ? 'Parsing...' : 'Parse Price File'}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={parseResult.ready.length === 0 || saving || parsing}
              className="rounded-xl bg-green-700 px-5 py-3 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {saving ? 'Saving...' : 'Save Clean Rows + Create/Update L3s'}
            </button>
          </div>

          {totalParsedRows > 0 ? (
            <div className="mt-6 grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Total parsed:{' '}
                <span className="font-semibold text-slate-900">{totalParsedRows}</span>
              </div>
              <div className="rounded-xl border bg-green-50 px-4 py-3 text-sm text-green-700">
                Clean:{' '}
                <span className="font-semibold text-green-900">{parseResult.ready.length}</span>
              </div>
              <div className="rounded-xl border bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Needs review:{' '}
                <span className="font-semibold text-amber-900">
                  {parseResult.needsReview.length}
                </span>
              </div>
              <div className="rounded-xl border bg-red-50 px-4 py-3 text-sm text-red-700">
                Rejected:{' '}
                <span className="font-semibold text-red-900">{parseResult.rejected.length}</span>
              </div>
            </div>
          ) : null}
        </section>

        {parseResult.ready.length > 0 ? (
          <section className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-xl font-semibold text-slate-900">Clean Parsed Rows</h2>
              <p className="mt-1 text-sm text-slate-700">
                These rows are ready to save. You can still edit them before saving.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-100 text-sm">
                  <tr>
                    <th className="px-3 py-3 text-slate-800">SKU</th>
                    <th className="px-3 py-3 text-slate-800">Name</th>
                    <th className="px-3 py-3 text-slate-800">Pack</th>
                    <th className="px-3 py-3 text-slate-800">Weight</th>
                    <th className="px-3 py-3 text-slate-800">Pack Price</th>
                    <th className="px-3 py-3 text-slate-800">Unit Price</th>
                    <th className="px-3 py-3 text-slate-800">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {parseResult.ready
                    .slice(0, 250)
                    .map((row, index) => renderEditableRow({ row, index, mode: 'ready' }))}
                </tbody>
              </table>
            </div>

            {parseResult.ready.length > 250 ? (
              <div className="border-t bg-slate-50 px-6 py-3 text-sm text-slate-700">
                Showing first 250 clean rows. All {parseResult.ready.length} clean rows will still
                be saved.
              </div>
            ) : null}
          </section>
        ) : null}

        {parseResult.needsReview.length > 0 ? (
          <section className="mt-8 overflow-hidden rounded-2xl border border-amber-300 bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Rows Needing Review</h2>
                  <p className="mt-1 text-sm text-slate-700">
                    Edit these rows, then approve them into the clean list.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={approveAllReviewRows}
                  className="rounded-xl border border-green-300 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
                >
                  Approve All Reviewed Rows
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-amber-50 text-sm">
                  <tr>
                    <th className="px-3 py-3 text-slate-800">SKU</th>
                    <th className="px-3 py-3 text-slate-800">Name / Reason</th>
                    <th className="px-3 py-3 text-slate-800">Pack</th>
                    <th className="px-3 py-3 text-slate-800">Weight</th>
                    <th className="px-3 py-3 text-slate-800">Pack Price</th>
                    <th className="px-3 py-3 text-slate-800">Unit Price</th>
                    <th className="px-3 py-3 text-slate-800">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {parseResult.needsReview
                    .slice(0, 250)
                    .map((row, index) => renderEditableRow({ row, index, mode: 'review' }))}
                </tbody>
              </table>
            </div>

            {parseResult.needsReview.length > 250 ? (
              <div className="border-t bg-amber-50 px-6 py-3 text-sm text-amber-800">
                Showing first 250 review rows.
              </div>
            ) : null}
          </section>
        ) : null}

        {parseResult.rejected.length > 0 ? (
          <section className="mt-8 overflow-hidden rounded-2xl border border-red-300 bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-xl font-semibold text-slate-900">Rejected Rows</h2>
              <p className="mt-1 text-sm text-slate-700">
                These were not considered safe enough to save automatically.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-red-50 text-sm">
                  <tr>
                    <th className="px-4 py-3 text-slate-800">Reason</th>
                    <th className="px-4 py-3 text-slate-800">Raw Text</th>
                  </tr>
                </thead>

                <tbody>
                  {parseResult.rejected.slice(0, 100).map((row, index) => (
                    <tr key={`rejected-${index}`} className="border-t align-top">
                      <td className="px-4 py-3 text-sm text-red-700">
                        {row.reason ?? 'Rejected'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {row.raw ?? row.name ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {parseResult.rejected.length > 100 ? (
              <div className="border-t bg-red-50 px-6 py-3 text-sm text-red-800">
                Showing first 100 rejected rows.
              </div>
            ) : null}
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

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-100 text-sm">
                <tr>
                  <th className="px-4 py-3 text-slate-800">Supplier Product</th>
                  <th className="px-4 py-3 text-slate-800">SKU</th>
                  <th className="px-4 py-3 text-slate-800">Pack</th>
                  <th className="px-4 py-3 text-slate-800">Price</th>
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

                      <td className="px-4 py-3 text-slate-800">
                        {product.supplierSku ?? ''}
                      </td>

                      <td className="px-4 py-3 text-slate-800">
                        {[product.packSize, product.weight].filter(Boolean).join(' / ')}
                      </td>

                      <td className="px-4 py-3 text-slate-800">
                        {money(product.packPrice)}
                      </td>

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