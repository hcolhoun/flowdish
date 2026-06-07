'use client'

import { useEffect, useMemo, useState } from 'react'

type InventoryLotRow = {
  id: string
  itemId: string
  sku: string
  name: string
  unitType: 'g' | 'ml' | 'each'
  qtyInitial: number
  qtyRemaining: number
  expiryAt: string | null
  sourceType: 'DELIVERY' | 'PREP'
  unitCost: number
  batchCode: string | null
  createdAt: string
  deliveryId: string | null
  delivery: {
    id: string
    deliveredAt: string
    supplier: string | null
    price: number | null
  } | null
}

export default function InventoryPage() {
  const [rows, setRows] = useState<InventoryLotRow[]>([])
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'DELIVERY' | 'PREP'>('ALL')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()

    return rows.filter((row) => {
      const matchesSource = sourceFilter === 'ALL' || row.sourceType === sourceFilter

      const haystack = [
        row.sku,
        row.name,
        row.unitType,
        row.sourceType,
        row.batchCode ?? '',
        row.delivery?.supplier ?? '',
        row.delivery ? formatDate(row.delivery.deliveredAt) : '',
        formatDate(row.expiryAt),
      ]
        .join(' ')
        .toLowerCase()

      const matchesSearch = !q || haystack.includes(q)

      return matchesSource && matchesSearch
    })
  }, [rows, search, sourceFilter])

  const totals = useMemo(() => {
    const totalLots = filteredRows.length
    const totalValue = filteredRows.reduce(
      (sum, row) => sum + row.qtyRemaining * (row.unitCost ?? 0),
      0
    )

    return { totalLots, totalValue }
  }, [filteredRows])

  async function safeJson(res: Response) {
    const text = await res.text()

    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 500))
    }
  }

  function formatDate(value: string | null) {
    if (!value) return ''
    return new Date(value).toLocaleDateString('en-GB')
  }

  function formatQty(value: number) {
    return Number.isInteger(value) ? String(value) : value.toFixed(3)
  }

  function money(value: number | null | undefined) {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(value ?? 0)
  }

  async function loadRows() {
    try {
      setLoading(true)
      setError('')

      const res = await fetch('/api/inventory', { cache: 'no-store' })
      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load inventory')
      }

      setRows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRows()
  }, [])

  async function handleDelete(row: InventoryLotRow) {
    setError('')
    setMessage('')

    const deliveryLabel = row.delivery
      ? `Delivery date: ${formatDate(row.delivery.deliveredAt)}`
      : 'No linked delivery'

    const confirmed = window.confirm(
      `Delete this inventory lot?\n\n${row.name} [${row.sku}]\nQty: ${formatQty(
        row.qtyRemaining
      )} ${row.unitType}\n${deliveryLabel}\n\nThis removes stock from inventory only.`
    )

    if (!confirmed) return

    try {
      setDeletingId(row.id)

      const res = await fetch(`/api/inventory?id=${row.id}`, {
        method: 'DELETE',
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to delete inventory lot')
      }

      setMessage(`Inventory lot deleted for ${row.name}.`)
      await loadRows()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Inventory</h1>
            <p className="mt-2 text-sm text-slate-600">
              Lot-level stock created from deliveries and prep batches.
            </p>
          </div>

          <div className="rounded-2xl border bg-white px-5 py-3 text-sm text-slate-700 shadow-sm">
            <div>
              Lots:{' '}
              <span className="font-semibold text-slate-900">{totals.totalLots}</span>
            </div>
            <div>
              Value:{' '}
              <span className="font-semibold text-slate-900">{money(totals.totalValue)}</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="mt-4 rounded-xl border bg-white px-4 py-3 text-sm text-slate-600">
            Loading inventory…
          </div>
        ) : null}

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
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Search inventory
              </label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search item, SKU, supplier, source, expiry..."
                className="w-full rounded-xl border px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Source
              </label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as 'ALL' | 'DELIVERY' | 'PREP')}
                className="w-full rounded-xl border px-3 py-2 text-slate-900"
              >
                <option value="ALL">All sources</option>
                <option value="DELIVERY">Delivery</option>
                <option value="PREP">Prep</option>
              </select>
            </div>
          </div>

          <p className="mt-3 text-sm text-slate-600">
            Showing {filteredRows.length} of {rows.length} lots.
          </p>
        </section>

        <div className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-100 text-sm">
                <tr>
                  <th className="px-4 py-3 text-slate-800">SKU</th>
                  <th className="px-4 py-3 text-slate-800">Name</th>
                  <th className="px-4 py-3 text-slate-800">Qty Remaining</th>
                  <th className="px-4 py-3 text-slate-800">Qty Initial</th>
                  <th className="px-4 py-3 text-slate-800">Unit</th>
                  <th className="px-4 py-3 text-slate-800">Source</th>
                  <th className="px-4 py-3 text-slate-800">Delivery Date</th>
                  <th className="px-4 py-3 text-slate-800">Supplier</th>
                  <th className="px-4 py-3 text-slate-800">Batch Code</th>
                  <th className="px-4 py-3 text-slate-800">Expiry</th>
                  <th className="px-4 py-3 text-slate-800">Unit Cost</th>
                  <th className="px-4 py-3 text-slate-800">Lot Value</th>
                  <th className="px-4 py-3 text-slate-800">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.length === 0 ? (
                  <tr className="border-t">
                    <td className="px-4 py-3 text-slate-700" colSpan={13}>
                      No inventory lots match your search.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const canDelete = row.qtyRemaining === row.qtyInitial

                    return (
                      <tr key={row.id} className="border-t">
                        <td className="px-4 py-3 text-slate-800">{row.sku}</td>
                        <td className="px-4 py-3 text-slate-800">{row.name}</td>
                        <td className="px-4 py-3 text-slate-800">
                          {formatQty(row.qtyRemaining)}
                        </td>
                        <td className="px-4 py-3 text-slate-800">
                          {formatQty(row.qtyInitial)}
                        </td>
                        <td className="px-4 py-3 text-slate-800">{row.unitType}</td>
                        <td className="px-4 py-3 text-slate-800">{row.sourceType}</td>
                        <td className="px-4 py-3 text-slate-800">
                          {row.delivery ? formatDate(row.delivery.deliveredAt) : ''}
                        </td>
                        <td className="px-4 py-3 text-slate-800">
                          {row.delivery?.supplier ?? ''}
                        </td>
                        <td className="px-4 py-3 text-slate-800">{row.batchCode ?? ''}</td>
                        <td className="px-4 py-3 text-slate-800">
                          {formatDate(row.expiryAt)}
                        </td>
                        <td className="px-4 py-3 text-slate-800">
                          {money(row.unitCost)}
                        </td>
                        <td className="px-4 py-3 text-slate-800">
                          {money(row.qtyRemaining * row.unitCost)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleDelete(row)}
                            disabled={!canDelete || deletingId === row.id}
                            title={
                              canDelete
                                ? 'Delete this inventory lot'
                                : 'Cannot delete because some stock from this lot has already been used'
                            }
                            className="rounded-lg border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {deletingId === row.id ? 'Deleting…' : 'Delete'}
                          </button>
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
          Inventory lots can only be deleted while none of their stock has been consumed. Deleting
          inventory here does not delete the delivery record.
        </div>
      </div>
    </main>
  )
}
