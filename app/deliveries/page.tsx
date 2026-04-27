'use client'

import { useEffect, useState } from 'react'

type Item = {
  id: string
  sku: string
  name: string
  itemType: 'L1' | 'L2' | 'L3'
  unitType: 'g' | 'ml' | 'each'
}

type Delivery = {
  id: string
  deliveredAt: string
  qty: number
  supplier: string | null
  price: number | null
  expiryAt: string | null
  item: Item
}

export default function DeliveriesPage() {
  const [items, setItems] = useState<Item[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [itemId, setItemId] = useState('')
  const [deliveredAt, setDeliveredAt] = useState('')
  const [qty, setQty] = useState('')
  const [supplier, setSupplier] = useState('')
  const [price, setPrice] = useState('')
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

      const [itemsRes, deliveriesRes] = await Promise.all([
        fetch('/api/items', { cache: 'no-store' }),
        fetch('/api/deliveries', { cache: 'no-store' }),
      ])

      const itemsData = await safeJson(itemsRes)
      const deliveriesData = await safeJson(deliveriesRes)

      if (!itemsRes.ok) {
        throw new Error(itemsData?.error || 'Failed to load items')
      }

      if (!deliveriesRes.ok) {
        throw new Error(deliveriesData?.error || 'Failed to load deliveries')
      }

      setItems(itemsData.filter((item: Item) => item.itemType === 'L3'))
      setDeliveries(deliveriesData)
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

      const res = await fetch('/api/deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          deliveredAt,
          qty: Number(qty),
          supplier,
          price: price ? Number(price) : null,
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save delivery')
      }

      setItemId('')
      setDeliveredAt('')
      setQty('')
      setSupplier('')
      setPrice('')
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-semibold">Deliveries</h1>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-8 grid gap-4 rounded-2xl border bg-white p-6 shadow-sm md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">L3 Item</label>
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
            <label className="mb-1 block text-sm font-medium">Delivered At</label>
            <input
              type="date"
              value={deliveredAt}
              onChange={(e) => setDeliveredAt(e.target.value)}
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
            <label className="mb-1 block text-sm font-medium">Supplier</label>
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Unit Price</label>
            <input
              type="number"
              step="0.000001"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
            />
          </div>

          <div className="flex items-end">
            <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-white">
              Save Delivery
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
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Expiry</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id} className="border-t">
                  <td className="px-4 py-3">{new Date(delivery.deliveredAt).toLocaleDateString('en-GB')}</td>
                  <td className="px-4 py-3">
                    {delivery.item.name} [{delivery.item.sku}]
                  </td>
                  <td className="px-4 py-3">{delivery.qty}</td>
                  <td className="px-4 py-3">{delivery.supplier ?? ''}</td>
                  <td className="px-4 py-3">{delivery.price ?? ''}</td>
                  <td className="px-4 py-3">
                    {delivery.expiryAt ? new Date(delivery.expiryAt).toLocaleDateString('en-GB') : ''}
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