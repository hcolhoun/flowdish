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
  unitType: 'g' | 'ml' | 'each'
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
  const [totalCost, setTotalCost] = useState('')

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const selectedItem = items.find((item) => item.id === itemId)

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

  function money(value: number | null | undefined) {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(value ?? 0)
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

      if (!itemsRes.ok) throw new Error(itemsData?.error || 'Failed to load items')
      if (!deliveriesRes.ok) throw new Error(deliveriesData?.error || 'Failed to load deliveries')

      setItems(itemsData.filter((item: Item) => item.itemType === 'L3'))
      setDeliveries(deliveriesData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    setDeliveredAt(todayInputValue())
    loadData()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    try {
      setError('')
      setMessage('')

      const res = await fetch('/api/deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          deliveredAt,
          qty: Number(qty),
          supplier,
          totalCost: Number(totalCost),
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save delivery')
      }

      setItemId('')
      setDeliveredAt(todayInputValue())
      setQty('')
      setSupplier('')
      setTotalCost('')
      setMessage('Delivery saved.')
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  async function handleDelete(id: string, label: string) {
    setError('')
    setMessage('')

    const confirmed = window.confirm(`Delete delivery: ${label}?`)
    if (!confirmed) return

    const res = await fetch(`/api/deliveries?id=${id}`, {
      method: 'DELETE',
    })

    const data = await safeJson(res)

    if (!res.ok) {
      setError(data?.error || 'Failed to delete delivery')
      return
    }

    setMessage('Delivery deleted.')
    loadData()
  }

  const calculatedUnitCost =
    Number(qty) > 0 && Number(totalCost) > 0
      ? Number(totalCost) / Number(qty)
      : null

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-semibold text-slate-900">Deliveries</h1>

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

        <form
          onSubmit={handleSubmit}
          className="mt-8 grid gap-4 rounded-2xl border bg-white p-6 shadow-sm md:grid-cols-2"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              L3 Item
            </label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            >
              <option value="">Select L3 item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} [{item.sku}]
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              Delivered At
            </label>
            <input
              type="date"
              value={deliveredAt}
              onChange={(e) => setDeliveredAt(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              Quantity Delivered {selectedItem ? `(${selectedItem.unitType})` : ''}
            </label>
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
            <label className="mb-1 block text-sm font-medium text-slate-900">
              Supplier
            </label>
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              Total Delivery Cost (€)
            </label>
            <input
              type="number"
              step="0.01"
              value={totalCost}
              onChange={(e) => setTotalCost(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />

            {selectedItem && calculatedUnitCost !== null ? (
              <p className="mt-2 text-sm text-slate-700">
                Calculated cost: {money(calculatedUnitCost)} per {selectedItem.unitType}
              </p>
            ) : null}
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-5 py-3 text-white"
            >
              Save Delivery
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
                <th className="px-4 py-3 text-slate-800">Unit</th>
                <th className="px-4 py-3 text-slate-800">Supplier</th>
                <th className="px-4 py-3 text-slate-800">Total Cost</th>
                <th className="px-4 py-3 text-slate-800">Cost / Unit</th>
                <th className="px-4 py-3 text-slate-800">Expiry</th>
                <th className="px-4 py-3 text-slate-800">Actions</th>
              </tr>
            </thead>

            <tbody>
              {deliveries.length === 0 ? (
                <tr className="border-t">
                  <td className="px-4 py-3 text-slate-700" colSpan={9}>
                    No deliveries yet.
                  </td>
                </tr>
              ) : (
                deliveries.map((delivery) => {
                  const unitCost =
                    delivery.price && delivery.qty > 0
                      ? delivery.price / delivery.qty
                      : 0

                  return (
                    <tr key={delivery.id} className="border-t">
                      <td className="px-4 py-3 text-slate-800">
                        {formatDate(delivery.deliveredAt)}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {delivery.item.name} [{delivery.item.sku}]
                      </td>
                      <td className="px-4 py-3 text-slate-800">{delivery.qty}</td>
                      <td className="px-4 py-3 text-slate-800">{delivery.unitType}</td>
                      <td className="px-4 py-3 text-slate-800">{delivery.supplier ?? ''}</td>
                      <td className="px-4 py-3 text-slate-800">{money(delivery.price)}</td>
                      <td className="px-4 py-3 text-slate-800">
                        {money(unitCost)} / {delivery.unitType}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {formatDate(delivery.expiryAt)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            handleDelete(
                              delivery.id,
                              `${delivery.item.name} (${delivery.qty} ${delivery.unitType})`
                            )
                          }
                          className="rounded-lg border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
                        >
                          Delete
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
    </main>
  )
}