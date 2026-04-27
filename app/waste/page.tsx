'use client'

import { useEffect, useState } from 'react'

type Item = {
  id: string
  sku: string
  name: string
  itemType: 'L1' | 'L2' | 'L3'
  unitType: 'g' | 'ml' | 'each'
}

type WasteRecord = {
  id: string
  date: string
  qty: number
  item: Item
  reason?: string | null
}

export default function WastePage() {
  const [items, setItems] = useState<Item[]>([])
  const [wastes, setWastes] = useState<WasteRecord[]>([])
  const [itemId, setItemId] = useState('')
  const [date, setDate] = useState('')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
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

      const [itemsRes, wasteRes] = await Promise.all([
        fetch('/api/items', { cache: 'no-store' }),
        fetch('/api/waste', { cache: 'no-store' }),
      ])

      const itemsData = await safeJson(itemsRes)
      const wasteData = await safeJson(wasteRes)

      if (!itemsRes.ok) {
        throw new Error(itemsData?.error || 'Failed to load items')
      }

      if (!wasteRes.ok) {
        throw new Error(wasteData?.error || 'Failed to load waste records')
      }

      setItems(itemsData)
      setWastes(wasteData)
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

      const res = await fetch('/api/waste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          date,
          qty: Number(qty),
          reason,
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save waste')
      }

      setItemId('')
      setDate('')
      setQty('')
      setReason('')
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-semibold">Waste</h1>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-8 grid gap-4 rounded-2xl border bg-white p-6 shadow-sm md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Item</label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            >
              <option value="">Select item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} [{item.sku}] ({item.itemType})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Quantity</label>
            <input
              type="number"
              step="0.001"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Reason</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
            />
          </div>

          <div className="flex items-end">
            <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-white">
              Save Waste
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
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {wastes.map((waste) => (
                <tr key={waste.id} className="border-t">
                  <td className="px-4 py-3">{new Date(waste.date).toLocaleDateString('en-GB')}</td>
                  <td className="px-4 py-3">
                    {waste.item.name} [{waste.item.sku}]
                  </td>
                  <td className="px-4 py-3">{waste.qty}</td>
                  <td className="px-4 py-3">{waste.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}