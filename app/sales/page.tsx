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
  item: Item
}

export default function SalesPage() {
  const [items, setItems] = useState<Item[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [itemId, setItemId] = useState('')
  const [soldAt, setSoldAt] = useState('')
  const [qty, setQty] = useState('')
  const [error, setError] = useState('')

  async function safeJson(res: Response) {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 500))
    }
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
    loadData()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    try {
      setError('')

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
      setSoldAt('')
      setQty('')
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-semibold">Sales</h1>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-8 grid gap-4 rounded-2xl border bg-white p-6 shadow-sm md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">L1 Item</label>
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
            <label className="mb-1 block text-sm font-medium">Sold At</label>
            <input
              type="date"
              value={soldAt}
              onChange={(e) => setSoldAt(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Quantity Sold</label>
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
            <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-white">
              Save Sale
            </button>
          </div>
        </form>

        <div className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-sm">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Qty</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id} className="border-t">
                  <td className="px-4 py-3">{new Date(sale.soldAt).toLocaleDateString('en-GB')}</td>
                  <td className="px-4 py-3">
                    {sale.item.name} [{sale.item.sku}]
                  </td>
                  <td className="px-4 py-3">{sale.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}