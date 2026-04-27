'use client'

import { useEffect, useState } from 'react'

type Item = {
  id: string
  sku: string
  name: string
  itemType: 'L1' | 'L2'
  unitType: 'g' | 'ml' | 'each'
}

type SopResponse = {
  item: {
    id: string
    sku: string
    name: string
    itemType: 'L1' | 'L2' | 'L3'
    unitType: 'g' | 'ml' | 'each'
  }
  instructions: string
  directComponents: Array<{
    itemId: string
    sku: string
    name: string
    qty: number
    unitType: string
  }>
  directIngredients: Array<{
    itemId: string
    sku: string
    name: string
    qty: number
    unitType: string
  }>
  expandedIngredients: Array<{
    parentSku: string
    parentName: string
    sku: string
    name: string
    qty: number
    unitType: string
  }>
}

export default function SopsPage() {
  const [items, setItems] = useState<Item[]>([])
  const [itemId, setItemId] = useState('')
  const [sop, setSop] = useState<SopResponse | null>(null)
  const [instructions, setInstructions] = useState('')
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

  async function loadItems() {
    try {
      const res = await fetch('/api/items', { cache: 'no-store' })
      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load items')
      }

      setItems(data.filter((item: Item) => item.itemType === 'L1' || item.itemType === 'L2'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    loadItems()
  }, [])

  async function loadSop(selectedItemId: string) {
    try {
      setError('')
      setMessage('')
      setSop(null)
      setInstructions('')

      if (!selectedItemId) return

      const res = await fetch(`/api/sops?itemId=${selectedItemId}`, {
        cache: 'no-store',
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load SOP')
      }

      setSop(data)
      setInstructions(data.instructions || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  async function handleSave() {
    try {
      setError('')
      setMessage('')

      if (!itemId) {
        setError('Select an item first')
        return
      }

      const res = await fetch('/api/sops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          instructions,
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save SOP')
      }

      setMessage('SOP saved.')
      loadSop(itemId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-semibold text-slate-900">SOP Builder</h1>
        <p className="mt-2 text-slate-800">
          Select an L1 or L2 item. Ingredients are generated automatically from BOMs, and you write the instructions.
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

        <div className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <label className="mb-2 block text-sm font-medium text-slate-900">Recipe / SOP Item</label>
          <select
            value={itemId}
            onChange={(e) => {
              setItemId(e.target.value)
              loadSop(e.target.value)
            }}
            className="w-full rounded-xl border px-3 py-2"
          >
            <option value="">Select L1 or L2 item</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} [{item.sku}] ({item.itemType})
              </option>
            ))}
          </select>
        </div>

        {sop ? (
          <div className="mt-8 grid gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">
                {sop.item.name} [{sop.item.sku}]
              </h2>
              <p className="mt-1 text-sm text-slate-700">
                Type: {sop.item.itemType}
              </p>

              {sop.item.itemType === 'L1' ? (
                <>
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold text-slate-900">Direct Components (Prepared Items)</h3>
                    {sop.directComponents.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-700">None.</p>
                    ) : (
                      <ul className="mt-2 space-y-2 text-slate-800">
                        {sop.directComponents.map((row) => (
                          <li key={row.itemId}>
                            {row.name} [{row.sku}] — {row.qty} {row.unitType}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="mt-6">
                    <h3 className="text-lg font-semibold text-slate-900">Direct Ingredients</h3>
                    {sop.directIngredients.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-700">None.</p>
                    ) : (
                      <ul className="mt-2 space-y-2 text-slate-800">
                        {sop.directIngredients.map((row) => (
                          <li key={row.itemId}>
                            {row.name} [{row.sku}] — {row.qty} {row.unitType}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              ) : null}

              {sop.item.itemType === 'L2' ? (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold text-slate-900">Ingredients</h3>
                  {sop.directIngredients.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-700">None.</p>
                  ) : (
                    <ul className="mt-2 space-y-2 text-slate-800">
                      {sop.directIngredients.map((row) => (
                        <li key={row.itemId}>
                          {row.name} [{row.sku}] — {row.qty} {row.unitType}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              <div className="mt-6">
                <h3 className="text-lg font-semibold text-slate-900">Expanded Ingredient Breakdown</h3>
                {sop.expandedIngredients.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-700">None.</p>
                ) : (
                  <div className="mt-3 overflow-hidden rounded-xl border">
                    <table className="w-full text-left">
                      <thead className="bg-slate-100 text-sm">
                        <tr>
                          <th className="px-4 py-3 text-slate-800">Parent</th>
                          <th className="px-4 py-3 text-slate-800">Ingredient</th>
                          <th className="px-4 py-3 text-slate-800">Qty</th>
                          <th className="px-4 py-3 text-slate-800">Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sop.expandedIngredients.map((row, index) => (
                          <tr key={`${row.parentSku}-${row.sku}-${index}`} className="border-t">
                            <td className="px-4 py-3 text-slate-800">
                              {row.parentName} [{row.parentSku}]
                            </td>
                            <td className="px-4 py-3 text-slate-800">
                              {row.name} [{row.sku}]
                            </td>
                            <td className="px-4 py-3 text-slate-800">{row.qty}</td>
                            <td className="px-4 py-3 text-slate-800">{row.unitType}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Instructions</h2>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="mt-4 min-h-[420px] w-full rounded-xl border px-4 py-3"
                placeholder="Write the SOP / method here..."
              />
              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleSave}
                  className="rounded-xl bg-slate-900 px-5 py-3 text-white"
                >
                  Save SOP
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  )
}