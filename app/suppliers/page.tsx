'use client'

import { useState } from 'react'

export default function SuppliersPage() {
  const [supplier, setSupplier] = useState('Caterway')
  const [preview, setPreview] = useState<any[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function safeJson(res: Response) {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 500))
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      setError('')
      setMessage('')
      setPreview([])

      const file = e.target.files?.[0]
      if (!file) return

      const text = await file.text()

      if (supplier === 'Caterway') {
        const res = await fetch('/api/parse-caterway', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })

        const data = await safeJson(res)

        if (!res.ok) {
          throw new Error(data?.error || 'Failed to parse file')
        }

        setPreview(data)
      } else {
        setError('Sysco parser is not built yet.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  async function handleSave() {
    try {
      setError('')
      setMessage('')

      const res = await fetch('/api/supplier-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: preview }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save supplier products')
      }

      setMessage(`${preview.length} supplier products imported.`)
      setPreview([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  function money(value: number | null | undefined) {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 4,
    }).format(value ?? 0)
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-semibold text-slate-900">
          Supplier Price Upload
        </h1>

        <p className="mt-2 text-slate-800">
          Upload supplier price files so Flowdish can compare supplier products and prices.
        </p>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="mt-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
            {message}
          </div>
        ) : null}

        <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Supplier
              </label>
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
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Price File
              </label>
              <input
                type="file"
                accept=".pdf,.csv,.txt"
                onChange={handleFile}
                className="w-full rounded-xl border bg-white px-3 py-2 text-slate-900 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-white"
              />
            </div>
          </div>

          {preview.length > 0 ? (
            <div className="mt-6">
              <button
                type="button"
                onClick={handleSave}
                className="rounded-xl bg-slate-900 px-5 py-3 text-white"
              >
                Save {preview.length} Products
              </button>
            </div>
          ) : null}
        </section>

        {preview.length > 0 ? (
          <section className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-xl font-semibold text-slate-900">
                Import Preview
              </h2>
              <p className="mt-1 text-sm text-slate-700">
                Showing first 100 rows.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-100 text-sm">
                  <tr>
                    <th className="px-4 py-3 text-slate-800">Supplier</th>
                    <th className="px-4 py-3 text-slate-800">Name</th>
                    <th className="px-4 py-3 text-slate-800">Pack Size</th>
                    <th className="px-4 py-3 text-slate-800">Weight</th>
                    <th className="px-4 py-3 text-slate-800">Pack Price</th>
                    <th className="px-4 py-3 text-slate-800">Unit Price</th>
                    <th className="px-4 py-3 text-slate-800">Supplier SKU</th>
                  </tr>
                </thead>

                <tbody>
                  {preview.slice(0, 100).map((product, index) => (
                    <tr key={index} className="border-t">
                      <td className="px-4 py-3 text-slate-800">
                        {product.supplier}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {product.name}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {product.packSize ?? ''}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {product.weight ?? ''}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {money(product.packPrice)}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {product.unitPrice ? money(product.unitPrice) : ''}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {product.supplierSku ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  )
}