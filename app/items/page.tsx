'use client'

import { useEffect, useRef, useState } from 'react'

type Item = {
  id: string
  sku: string
  name: string
  itemType: 'L1' | 'L2' | 'L3'
  unitType: 'g' | 'ml' | 'each'
  shelfLifeDays: number | null
  sellingPrice: number | null
  standardBatchOutput: number | null
}

export default function ItemsPage() {
  const messageRef = useRef<HTMLDivElement | null>(null)

  const [items, setItems] = useState<Item[]>([])
  const [name, setName] = useState('')
  const [itemType, setItemType] = useState<'L1' | 'L2' | 'L3'>('L3')
  const [unitType, setUnitType] = useState<'g' | 'ml' | 'each'>('g')
  const [shelfLifeDays, setShelfLifeDays] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [standardBatchOutput, setStandardBatchOutput] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function safeJson(res: Response) {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 500))
    }
  }

  function scrollToMessage() {
    setTimeout(() => {
      messageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  async function loadItems() {
    const res = await fetch('/api/items', { cache: 'no-store' })
    const data = await safeJson(res)

    if (!res.ok) {
      setError(data.error || 'Failed to load items')
      scrollToMessage()
      return
    }

    setItems(data)
  }

  useEffect(() => {
    loadItems()
  }, [])

  function handleItemTypeChange(nextType: 'L1' | 'L2' | 'L3') {
    setItemType(nextType)
    setError('')
    setMessage('')

    if (nextType === 'L1') {
      setUnitType('each')
      setShelfLifeDays('')
      setStandardBatchOutput('')
    }

    if (nextType === 'L2') {
      setSellingPrice('')
      if (unitType === 'each') setUnitType('g')
    }

    if (nextType === 'L3') {
      setSellingPrice('')
      setStandardBatchOutput('')
      if (unitType === 'each') setUnitType('g')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')

    const res = await fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        itemType,
        unitType: itemType === 'L1' ? 'each' : unitType,
        shelfLifeDays:
          itemType === 'L2' || itemType === 'L3'
            ? shelfLifeDays
              ? Number(shelfLifeDays)
              : null
            : null,
        sellingPrice: itemType === 'L1' ? (sellingPrice ? Number(sellingPrice) : null) : null,
        standardBatchOutput:
          itemType === 'L2'
            ? standardBatchOutput
              ? Number(standardBatchOutput)
              : null
            : null,
      }),
    })

    const data = await safeJson(res)

    if (!res.ok) {
      setError(data.error || 'Failed to save item')
      scrollToMessage()
      return
    }

    setName('')
    setItemType('L3')
    setUnitType('g')
    setShelfLifeDays('')
    setSellingPrice('')
    setStandardBatchOutput('')
    setMessage(`Item saved. SKU generated: ${data.sku}`)
    scrollToMessage()
    loadItems()
  }

  async function handleDelete(id: string, label: string) {
    setError('')
    setMessage('')

    const confirmed = window.confirm(`Delete item: ${label}?`)
    if (!confirmed) return

    const res = await fetch(`/api/items?id=${id}`, {
      method: 'DELETE',
    })

    const data = await safeJson(res)

    if (!res.ok) {
      setError(data.error || 'Failed to delete item')
      scrollToMessage()
      return
    }

    setMessage('Item deleted.')
    scrollToMessage()
    loadItems()
  }

  function displayValue(value: number | null) {
    return value === null || value === undefined ? 'N/A' : String(value)
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-semibold text-slate-900">Items</h1>
        <p className="mt-2 text-slate-800">
          Create and view L1, L2, and L3 items.
        </p>

        <div ref={messageRef}>
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
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8 grid gap-4 rounded-2xl border bg-white p-6 shadow-sm md:grid-cols-3"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              Item Type
            </label>
            <select
              value={itemType}
              onChange={(e) => handleItemTypeChange(e.target.value as 'L1' | 'L2' | 'L3')}
              className="w-full rounded-xl border px-3 py-2"
            >
              <option value="L1">L1 - Finished dish</option>
              <option value="L2">L2 - Prepared batch item</option>
              <option value="L3">L3 - Bought ingredient</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />
          </div>

          {itemType !== 'L1' ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Unit Type
              </label>
              <select
                value={unitType}
                onChange={(e) => setUnitType(e.target.value as 'g' | 'ml' | 'each')}
                className="w-full rounded-xl border px-3 py-2"
              >
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="each">each</option>
              </select>
            </div>
          ) : null}

          {itemType === 'L1' ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Selling Price
              </label>
              <input
                type="number"
                step="0.01"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
                required
              />
            </div>
          ) : null}

          {itemType === 'L2' || itemType === 'L3' ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Shelf Life Days
              </label>
              <input
                type="number"
                step="1"
                value={shelfLifeDays}
                onChange={(e) => setShelfLifeDays(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
                required
              />
            </div>
          ) : null}

          {itemType === 'L2' ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Standard Batch Output
              </label>
              <input
                type="number"
                step="0.001"
                value={standardBatchOutput}
                onChange={(e) => setStandardBatchOutput(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
                required
              />
            </div>
          ) : null}

          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-white"
            >
              Save Item
            </button>
          </div>
        </form>

        <div className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-sm">
              <tr>
                <th className="px-4 py-3 text-slate-800">SKU</th>
                <th className="px-4 py-3 text-slate-800">Name</th>
                <th className="px-4 py-3 text-slate-800">Type</th>
                <th className="px-4 py-3 text-slate-800">Unit</th>
                <th className="px-4 py-3 text-slate-800">Shelf Life</th>
                <th className="px-4 py-3 text-slate-800">Selling Price</th>
                <th className="px-4 py-3 text-slate-800">Std Batch Output</th>
                <th className="px-4 py-3 text-slate-800">Actions</th>
              </tr>
            </thead>

            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3 text-slate-800">{item.sku}</td>
                  <td className="px-4 py-3 text-slate-800">{item.name}</td>
                  <td className="px-4 py-3 text-slate-800">{item.itemType}</td>
                  <td className="px-4 py-3 text-slate-800">
                    {item.itemType === 'L1' ? 'N/A' : item.unitType}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    {item.itemType === 'L2' || item.itemType === 'L3'
                      ? displayValue(item.shelfLifeDays)
                      : 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    {item.itemType === 'L1' ? displayValue(item.sellingPrice) : 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    {item.itemType === 'L2'
                      ? displayValue(item.standardBatchOutput)
                      : 'N/A'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id, `${item.name} [${item.sku}]`)}
                      className="rounded-lg border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
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