'use client'

import { useEffect, useMemo, useState } from 'react'

type UnitType = 'g' | 'ml' | 'each'

type Item = {
  id: string
  sku: string
  name: string
  itemType: 'L1' | 'L2' | 'L3'
  unitType: UnitType
  shelfLifeDays: number | null
  standardBatchOutput: number | null
}

type PrepBatch = {
  id: string
  preparedAt: string
  qtyOutput: number
  expiryAt: string | null
  createdAt?: string | null
  enteredByName?: string | null
  enteredByType?: string | null
  item: Item
}

type EditingPrep = {
  preparedAt: string
  qtyOutput: string
  expiryAt: string
}

function toDateInputValue(value: string | Date | null | undefined) {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 10)
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function addDaysToInputDate(dateValue: string, days: number | null) {
  if (!dateValue || days === null || days === undefined) return ''
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return ''
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export default function PrepPage() {
  const [items, setItems] = useState<Item[]>([])
  const [prepBatches, setPrepBatches] = useState<PrepBatch[]>([])
  const [itemId, setItemId] = useState('')
  const [preparedAt, setPreparedAt] = useState('')
  const [qtyOutput, setQtyOutput] = useState('')
  const [expiryAt, setExpiryAt] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingPrep, setEditingPrep] = useState<EditingPrep | null>(null)

  const selectedItem = useMemo(
    () => items.find((item) => item.id === itemId) ?? null,
    [items, itemId]
  )

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

  function formatDateTime(value: string | null | undefined) {
    if (!value) return ''

    return new Date(value).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function enteredByLabel(batch: PrepBatch) {
    const name = batch.enteredByName || 'Unknown'
    const date = formatDateTime(batch.createdAt)

    return date ? `${name} · ${date}` : name
  }

  function formatQty(value: number) {
    return Number.isInteger(value) ? String(value) : value.toFixed(3)
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
    const today = todayInputValue()
    setPreparedAt(today)
    loadData()
  }, [])

  useEffect(() => {
    if (!selectedItem || !preparedAt) {
      setExpiryAt('')
      return
    }

    setExpiryAt(addDaysToInputDate(preparedAt, selectedItem.shelfLifeDays))
  }, [selectedItem?.id, preparedAt])

  function startEditPrep(batch: PrepBatch) {
    setEditingId(batch.id)
    setEditingPrep({
      preparedAt: toDateInputValue(batch.preparedAt),
      qtyOutput: String(batch.qtyOutput),
      expiryAt: toDateInputValue(batch.expiryAt),
    })
    setError('')
    setMessage('')
  }

  function cancelEditPrep() {
    setEditingId(null)
    setEditingPrep(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    try {
      setSaving(true)
      setError('')
      setMessage('')

      const res = await fetch('/api/prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          preparedAt,
          qtyOutput: Number(qtyOutput),
          expiryAt: expiryAt || null,
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save prep batch')
      }

      const today = todayInputValue()
      setItemId('')
      setPreparedAt(today)
      setQtyOutput('')
      setExpiryAt('')
      setMessage('Prep batch saved.')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  async function savePrepEdit(batch: PrepBatch) {
    if (!editingPrep) return

    try {
      setSaving(true)
      setError('')
      setMessage('')

      const res = await fetch('/api/prep', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: batch.id,
          preparedAt: editingPrep.preparedAt,
          qtyOutput: Number(editingPrep.qtyOutput),
          expiryAt: editingPrep.expiryAt || null,
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to update prep batch')
      }

      setMessage('Prep batch updated.')
      cancelEditPrep()
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
        <h1 className="text-3xl font-semibold text-slate-900">Prep</h1>

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
          <div className="md:col-span-2">
            <h2 className="text-xl font-semibold text-slate-900">New Prep Batch</h2>
            <p className="mt-1 text-sm text-slate-600">
              The expiry date defaults from the L2 shelf life, but can be changed before saving.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">L2 Item</label>
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

            {selectedItem ? (
              <p className="mt-2 text-sm text-slate-600">
                Unit: {selectedItem.unitType} · Shelf life:{' '}
                {selectedItem.shelfLifeDays ?? 'N/A'} days · Std batch:{' '}
                {selectedItem.standardBatchOutput ?? 'N/A'}
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">Prepared At</label>
            <input
              type="date"
              value={preparedAt}
              onChange={(e) => setPreparedAt(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              Output Quantity {selectedItem ? `(${selectedItem.unitType})` : ''}
            </label>
            <input
              type="number"
              step="0.001"
              value={qtyOutput}
              onChange={(e) => setQtyOutput(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              Expiry Date
            </label>
            <input
              type="date"
              value={expiryAt}
              onChange={(e) => setExpiryAt(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {saving ? 'Saving…' : 'Save Prep Batch'}
            </button>
          </div>
        </form>

        <div className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-sm">
              <tr>
                <th className="px-4 py-3 text-slate-800">Date</th>
                <th className="px-4 py-3 text-slate-800">Item</th>
                <th className="px-4 py-3 text-slate-800">Qty Output</th>
                <th className="px-4 py-3 text-slate-800">Unit</th>
                <th className="px-4 py-3 text-slate-800">Expiry</th>
                <th className="px-4 py-3 text-slate-800">Entered</th>
                <th className="px-4 py-3 text-slate-800">Actions</th>
              </tr>
            </thead>
            <tbody>
              {prepBatches.length === 0 ? (
                <tr className="border-t">
                  <td className="px-4 py-3 text-slate-700" colSpan={7}>
                    No prep batches yet.
                  </td>
                </tr>
              ) : (
                prepBatches.map((batch) => {
                  const isEditing = editingId === batch.id && editingPrep

                  return (
                    <tr key={batch.id} className="border-t">
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="date"
                            value={editingPrep.preparedAt}
                            onChange={(e) =>
                              setEditingPrep({
                                ...editingPrep,
                                preparedAt: e.target.value,
                              })
                            }
                            className="rounded-lg border px-2 py-1 text-sm"
                          />
                        ) : (
                          formatDate(batch.preparedAt)
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {batch.item.name} [{batch.item.sku}]
                      </td>

                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.001"
                            value={editingPrep.qtyOutput}
                            onChange={(e) =>
                              setEditingPrep({
                                ...editingPrep,
                                qtyOutput: e.target.value,
                              })
                            }
                            className="w-28 rounded-lg border px-2 py-1 text-sm"
                          />
                        ) : (
                          formatQty(batch.qtyOutput)
                        )}
                      </td>

                      <td className="px-4 py-3">{batch.item.unitType}</td>

                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="date"
                            value={editingPrep.expiryAt}
                            onChange={(e) =>
                              setEditingPrep({
                                ...editingPrep,
                                expiryAt: e.target.value,
                              })
                            }
                            className="rounded-lg border px-2 py-1 text-sm"
                          />
                        ) : (
                          formatDate(batch.expiryAt)
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-xs text-slate-500">{enteredByLabel(batch)}</div>
                      </td>

<td className="px-4 py-3">
  <div className="flex flex-wrap gap-2">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => savePrepEdit(batch)}
                                disabled={saving}
                                className="rounded-lg border border-green-300 px-3 py-1 text-sm text-green-700 hover:bg-green-50 disabled:opacity-60"
                              >
                                Save
                              </button>

                              <button
                                type="button"
                                onClick={cancelEditPrep}
                                disabled={saving}
                                className="rounded-lg border px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditPrep(batch)}
                              className="rounded-lg border px-3 py-1 text-sm text-slate-800 hover:bg-slate-50"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Editing a prep batch is only allowed while the produced L2 stock has not been used.
        </div>
      </div>
    </main>
  )
}