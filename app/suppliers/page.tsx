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

export default function SuppliersPage() {
  const [supplier, setSupplier] = useState('Caterway')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<any[]>([])
  const [products, setProducts] = useState<SupplierProduct[]>([])
  const [search, setSearch] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('ALL')
  const [linkFilter, setLinkFilter] = useState('ALL')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)

  async function safeJson(res: Response) {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 500))
    }
  }

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

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError('')
    setMessage('')
    setPreview([])
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
      setParsing(true)

      if (!selectedFile) {
        setError('Choose a file first.')
        return
      }

      if (supplier !== 'Caterway') {
        setError('Sysco parser is not built yet.')
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
        throw new Error(data?.error || 'Failed to parse file')
      }

      setPreview(data)

      if (data.length === 0) {
        setError('No rows were parsed from the PDF.')
        return
      }

      setMessage(`${data.length} products parsed. Review below, then click Save Products.`)
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

      if (preview.length === 0) {
        setError('No parsed products to save. Parse the file first.')
        return
      }

      setMessage('Saving supplier products and creating L3 items. This may take a moment...')

      const res = await fetch('/api/supplier-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: preview }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save supplier products')
      }

      setMessage(
        `${preview.length} supplier products saved. ${data.linkedCount ?? 0} linked to L3 items.`
      )

      setPreview([])
      setSelectedFile(null)
      setFileName('')
      await loadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  function money(value: number | null | undefined) {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 4,
    }).format(value ?? 0)
  }

  const visibleProducts = filteredProducts.slice(0, 100)

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-semibold text-slate-900">Supplier Products</h1>

        <p className="mt-2 text-slate-800">
          Upload supplier price lists, create L3 items, and link supplier products to kitchen ingredients.
        </p>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="mt-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
            {message}
          </div>
        ) : null}

        {saving ? (
          <div className="mt-4 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            Creating L3 items and linking supplier products. Please wait...
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
                accept=".pdf,.csv,.txt"
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
              className="rounded-xl bg-slate-900 px-5 py-3 text-white disabled:bg-slate-400"
            >
              {parsing ? 'Parsing...' : 'Parse Price File'}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={preview.length === 0 || saving}
              className="rounded-xl bg-green-700 px-5 py-3 text-white disabled:bg-slate-400"
            >
              {saving ? 'Creating L3s...' : 'Save Products + Create L3s'}
            </button>
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-xl font-semibold text-slate-900">Import Preview</h2>
            <p className="mt-1 text-sm text-slate-700">
              Parsed rows: {preview.length}. Showing first 100 rows.
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
                {preview.slice(0, 100).map((product, index) => (
                  <tr key={index} className="border-t">
                    <td className="px-4 py-3 text-slate-800">{product.supplier}</td>
                    <td className="px-4 py-3 text-slate-800">{product.name}</td>
                    <td className="px-4 py-3 text-slate-800">{product.weight ?? ''}</td>
                    <td className="px-4 py-3 text-slate-800">{money(product.packPrice)}</td>
                    <td className="px-4 py-3 text-slate-800">
                      {product.unitPrice ? money(product.unitPrice) : ''}
                    </td>
                    <td className="px-4 py-3 text-slate-800">{product.supplierSku ?? ''}</td>
                  </tr>
                ))}
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
                  <th className="px-4 py-3 text-slate-800">Price</th>
                  <th className="px-4 py-3 text-slate-800">Linked L3</th>
                </tr>
              </thead>

              <tbody>
                {visibleProducts.map((product) => (
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
                      {product.linkedItem ? (
                        <span className="text-green-700">
                          {product.linkedItem.name} [{product.linkedItem.sku}]
                        </span>
                      ) : (
                        <span className="text-red-700">Not linked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}