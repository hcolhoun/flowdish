'use client'

import { useEffect, useState } from 'react'

type Item = {
  id: string
  sku: string
  name: string
  itemType: 'L1' | 'L2' | 'L3'
  unitType: 'g' | 'ml' | 'each'
}

type Sale = {
  id: string
  soldAt: string
  qty: number
  cost: number
  item: Item
}

export default function SalesPage() {
  const [items, setItems] = useState<Item[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [itemId, setItemId] = useState('')
  const [soldAt, setSoldAt] = useState('')
  const [qty, setQty] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  async function safeJson(res: Response) {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 500))
    }
  }

  function todayInputValue() {
    return new Date().toISOString().slice(0, 10)
  }

  function formatDate(value: string | null) {
    if (!value) return ''
    return new Date(value).toLocaleDateString('en-GB')
  }

  function money(value: number | null | undefined, maximumFractionDigits = 2) {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits,
    }).format(value ?? 0)
  }

  async function loadData() {
    try {
      setError('')

      const [itemsRes, salesRes] = await Promise.all([
        fetch('/api/items', { cache: 'no-store' }),
        fetch('/api/sales', { cache: 'no-store' }),
      ])

      const itemsData = await safeJson(itemsRes)
      const salesData = await safeJson(salesRes)

      if (!itemsRes.ok) {
        throw new Error(itemsData?.error || 'Failed to load items')
      }

      if (!salesRes.ok) {
        throw new Error(salesData?.error || 'Failed to load sales')
      }

      setItems(itemsData.filter((item: Item) => item.itemType === 'L1'))
      setSales(salesData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    setSoldAt(todayInputValue())
    loadData()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    try {
      setError('')
      setMessage('')
      setSaving(true)

      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          soldAt,
          qty: Number(qty),
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save sale')
      }

      setItemId('')
      setSoldAt(todayInputValue())
      setQty('')
      setMessage('Sale saved and BOM stock consumed.')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-semibold text-slate-900">Sales</h1>

        <p className="mt-2 text-sm text-slate-700">
          Sales of L1 dishes consume the dish BOM from inventory: L1 → L2 prep stock and L1 → L3
          direct ingredients.
        </p>

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

        <form
          onSubmit={handleSubmit}
          className="mt-8 grid gap-4 rounded-2xl border bg-white p-6 shadow-sm md:grid-cols-2"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">L1 Item</label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            >
              <option value="">Select item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} [{item.sku}]
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">Sold At</label>
            <input
              type="date"
              value={soldAt}
              onChange={(e) => setSoldAt(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">Quantity Sold</label>
            <input
              type="number"
              step="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-slate-900 px-5 py-3 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {saving ? 'Saving…' : 'Save Sale'}
            </button>
          </div>
        </form>

        <div className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-sm">
              <tr>
                <th className="px-4 py-3 text-slate-800">Date</th>
                <th className="px-4 py-3 text-slate-800">Item</th>
                <th className="px-4 py-3 text-slate-800">Qty</th>
                <th className="px-4 py-3 text-slate-800">Cost Used</th>
                <th className="px-4 py-3 text-slate-800">Cost / Dish</th>
              </tr>
            </thead>

            <tbody>
              {sales.length === 0 ? (
                <tr className="border-t">
                  <td className="px-4 py-3 text-slate-700" colSpan={5}>
                    No sales yet.
                  </td>
                </tr>
              ) : (
                sales.map((sale) => (
                  <tr key={sale.id} className="border-t">
                    <td className="px-4 py-3 text-slate-800">{formatDate(sale.soldAt)}</td>
                    <td className="px-4 py-3 text-slate-800">
                      {sale.item.name} [{sale.item.sku}]
                    </td>
                    <td className="px-4 py-3 text-slate-800">{sale.qty}</td>
                    <td className="px-4 py-3 text-slate-800">{money(sale.cost)}</td>
                    <td className="px-4 py-3 text-slate-800">
                      {sale.qty > 0 ? money(sale.cost / sale.qty, 4) : money(0)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This records sales against L1 dishes but consumes the underlying BOM stock. It does not
          require finished L1 stock lots to exist.
        </div>
      </div>
    </main>
  )
}