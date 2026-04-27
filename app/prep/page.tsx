'use client'

import { useEffect, useState } from 'react'

type Item = {
  id: string
  sku: string
  name: string
  itemType: 'L1' | 'L2' | 'L3'
  unitType: 'g' | 'ml' | 'each'
  shelfLifeDays: number | null
  standardBatchOutput: number | null
}

type PrepBatch = {
  id: string
  preparedAt: string
  qtyOutput: number
  expiryAt: string | null
  item: Item
}

export default function PrepPage() {
  const [items, setItems] = useState<Item[]>([])
  const [prepBatches, setPrepBatches] = useState<PrepBatch[]>([])
  const [itemId, setItemId] = useState('')
  const [preparedAt, setPreparedAt] = useState('')
  const [qtyOutput, setQtyOutput] = useState('')
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

      const [itemsRes, prepRes] = await Promise.all([
        fetch('/api/items', { cache: 'no-store' }),
        fetch('/api/prep', { cache: 'no-store' }),
      ])

      const itemsData = await safeJson(itemsRes)
      const prepData = await safeJson(prepRes)

      if (!itemsRes.ok) {
        throw new Error(itemsData?.error || 'Failed to load items')
      }

      if (!prepRes.ok) {
        throw new Error(prepData?.error || 'Failed to load prep batches')
      }

      setItems(itemsData.filter((item: Item) => item.itemType === 'L2'))
      setPrepBatches(prepData)
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

      const res = await fetch('/api/prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          preparedAt,
          qtyOutput: Number(qtyOutput),
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save prep batch')
      }

      setItemId('')
      setPreparedAt('')
      setQtyOutput('')
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-semibold">Prep</h1>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-8 grid gap-4 rounded-2xl border bg-white p-6 shadow-sm md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">L2 Item</label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            >
              <option value="">Select prep item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} [{item.sku}]
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Prepared At</label>
            <input
              type="date"
              value={preparedAt}
              onChange={(e) => setPreparedAt(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Output Quantity</label>
            <input
              type="number"
              step="0.001"
              value={qtyOutput}
              onChange={(e) => setQtyOutput(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />
          </div>

          <div className="flex items-end">
            <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-white">
              Save Prep Batch
            </button>
          </div>
        </form>

        <div className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-sm">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Qty Output</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Expiry</th>
              </tr>
            </thead>
            <tbody>
              {prepBatches.map((batch) => (
                <tr key={batch.id} className="border-t">
                  <td className="px-4 py-3">{new Date(batch.preparedAt).toLocaleDateString('en-GB')}</td>
                  <td className="px-4 py-3">
                    {batch.item.name} [{batch.item.sku}]
                  </td>
                  <td className="px-4 py-3">{batch.qtyOutput}</td>
                  <td className="px-4 py-3">{batch.item.unitType}</td>
                  <td className="px-4 py-3">
                    {batch.expiryAt ? new Date(batch.expiryAt).toLocaleDateString('en-GB') : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}