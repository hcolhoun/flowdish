'use client'

import { useEffect, useMemo, useState } from 'react'

type Item = {
  id: string
  sku: string
  name: string
  itemType: 'L1' | 'L2' | 'L3'
  unitType: 'g' | 'ml' | 'each'
}

type ChildRow = {
  childId: string
  qty: string
}

export default function BomPage() {
  const [items, setItems] = useState<Item[]>([])
  const [parentId, setParentId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [l1ToL2Rows, setL1ToL2Rows] = useState<ChildRow[]>([])
  const [l1ToL3Rows, setL1ToL3Rows] = useState<ChildRow[]>([])
  const [l2ToL3Rows, setL2ToL3Rows] = useState<ChildRow[]>([])

  async function safeJson(res: Response) {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 1000))
    }
  }

  async function loadItems() {
    const res = await fetch('/api/items', { cache: 'no-store' })
    const data = await safeJson(res)

    if (!res.ok) throw new Error(data?.error || 'Failed to load items')
    setItems(data)
  }

  const parentItem = useMemo(
    () => items.find((item) => item.id === parentId) ?? null,
    [items, parentId]
  )

  const l1Items = items.filter((item) => item.itemType === 'L1')
  const l2Items = items.filter((item) => item.itemType === 'L2')
  const l3Items = items.filter((item) => item.itemType === 'L3')

  function getUnit(itemId: string) {
    return items.find((item) => item.id === itemId)?.unitType ?? ''
  }

  useEffect(() => {
    ;(async () => {
      try {
        setError('')
        await loadItems()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })()
  }, [])

  useEffect(() => {
    if (!parentItem) {
      setL1ToL2Rows([])
      setL1ToL3Rows([])
      setL2ToL3Rows([])
      return
    }

    ;(async () => {
      try {
        setError('')
        setMessage('')
        setLoading(true)

        if (parentItem.itemType === 'L1') {
          const [l1l2Res, l1l3Res] = await Promise.all([
            fetch(`/api/bom/l1-l2?parentId=${parentItem.id}`, { cache: 'no-store' }),
            fetch(`/api/bom/l1-l3?parentId=${parentItem.id}`, { cache: 'no-store' }),
          ])

          const l1l2Data = await safeJson(l1l2Res)
          const l1l3Data = await safeJson(l1l3Res)

          if (!l1l2Res.ok) throw new Error(l1l2Data?.error || 'Failed to load L1 → L2 BOM')
          if (!l1l3Res.ok) throw new Error(l1l3Data?.error || 'Failed to load L1 → L3 BOM')

          setL1ToL2Rows(
            l1l2Data.map((row: any) => ({
              childId: row.l2ItemId,
              qty: String(row.qty),
            }))
          )

          setL1ToL3Rows(
            l1l3Data.map((row: any) => ({
              childId: row.l3ItemId,
              qty: String(row.qty),
            }))
          )

          setL2ToL3Rows([])
        }

        if (parentItem.itemType === 'L2') {
          const res = await fetch(`/api/bom/l2-l3?parentId=${parentItem.id}`, {
            cache: 'no-store',
          })
          const data = await safeJson(res)

          if (!res.ok) throw new Error(data?.error || 'Failed to load L2 → L3 BOM')

          setL2ToL3Rows(
            data.map((row: any) => ({
              childId: row.l3ItemId,
              qty: String(row.qty),
            }))
          )

          setL1ToL2Rows([])
          setL1ToL3Rows([])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    })()
  }, [parentItem?.id, parentItem?.itemType])

  function addRow(setter: React.Dispatch<React.SetStateAction<ChildRow[]>>) {
    setter((prev) => [...prev, { childId: '', qty: '1' }])
  }

  function updateRow(
    rows: ChildRow[],
    setter: React.Dispatch<React.SetStateAction<ChildRow[]>>,
    index: number,
    field: 'childId' | 'qty',
    value: string
  ) {
    const next = [...rows]
    next[index] = { ...next[index], [field]: value }
    setter(next)
  }

  function removeRow(
    rows: ChildRow[],
    setter: React.Dispatch<React.SetStateAction<ChildRow[]>>,
    index: number
  ) {
    const next = [...rows]
    next.splice(index, 1)
    setter(next)
  }

  function validateRows(rows: ChildRow[], label: string) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const hasAnyData = row.childId !== '' || row.qty !== ''

      if (!hasAnyData) continue
      if (!row.childId) return `${label} row ${i + 1}: select a child item`

      if (row.qty === '' || Number(row.qty) <= 0 || Number.isNaN(Number(row.qty))) {
        return `${label} row ${i + 1}: enter a quantity greater than 0`
      }
    }

    return ''
  }

  async function saveL1() {
    if (!parentItem) return

    try {
      setError('')
      setMessage('Saving BOM…')

      const validationError =
        validateRows(l1ToL2Rows, 'L1 → L2') || validateRows(l1ToL3Rows, 'L1 → L3')

      if (validationError) {
        setMessage('')
        setError(validationError)
        return
      }

      const payloadL1L2 = {
        parentId: parentItem.id,
        rows: l1ToL2Rows
          .filter((row) => row.childId && row.qty !== '')
          .map((row) => ({
            childId: row.childId,
            qty: Number(row.qty),
          })),
      }

      const payloadL1L3 = {
        parentId: parentItem.id,
        rows: l1ToL3Rows
          .filter((row) => row.childId && row.qty !== '')
          .map((row) => ({
            childId: row.childId,
            qty: Number(row.qty),
          })),
      }

      const [l1l2Res, l1l3Res] = await Promise.all([
        fetch('/api/bom/l1-l2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadL1L2),
        }),
        fetch('/api/bom/l1-l3', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadL1L3),
        }),
      ])

      const l1l2Data = await safeJson(l1l2Res)
      const l1l3Data = await safeJson(l1l3Res)

      if (!l1l2Res.ok) throw new Error(l1l2Data?.error || 'Failed to save L1 → L2')
      if (!l1l3Res.ok) throw new Error(l1l3Data?.error || 'Failed to save L1 → L3')

      const [reloadL1L2, reloadL1L3] = await Promise.all([
        fetch(`/api/bom/l1-l2?parentId=${parentItem.id}`, { cache: 'no-store' }),
        fetch(`/api/bom/l1-l3?parentId=${parentItem.id}`, { cache: 'no-store' }),
      ])

      const reloadL1L2Data = await safeJson(reloadL1L2)
      const reloadL1L3Data = await safeJson(reloadL1L3)

      setL1ToL2Rows(
        reloadL1L2Data.map((row: any) => ({
          childId: row.l2ItemId,
          qty: String(row.qty),
        }))
      )

      setL1ToL3Rows(
        reloadL1L3Data.map((row: any) => ({
          childId: row.l3ItemId,
          qty: String(row.qty),
        }))
      )

      setMessage(
        `BOM saved and reloaded. Showing ${reloadL1L2Data.length} L2 row(s) and ${reloadL1L3Data.length} L3 row(s).`
      )
    } catch (err) {
      setMessage('')
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  async function saveL2() {
    if (!parentItem) return

    try {
      setError('')
      setMessage('Saving BOM…')

      const validationError = validateRows(l2ToL3Rows, 'L2 → L3')

      if (validationError) {
        setMessage('')
        setError(validationError)
        return
      }

      const payload = {
        parentId: parentItem.id,
        rows: l2ToL3Rows
          .filter((row) => row.childId && row.qty !== '')
          .map((row) => ({
            childId: row.childId,
            qty: Number(row.qty),
          })),
      }

      const res = await fetch('/api/bom/l2-l3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await safeJson(res)

      if (!res.ok) throw new Error(data?.error || 'Failed to save L2 → L3')

      const reload = await fetch(`/api/bom/l2-l3?parentId=${parentItem.id}`, {
        cache: 'no-store',
      })
      const reloadData = await safeJson(reload)

      setL2ToL3Rows(
        reloadData.map((row: any) => ({
          childId: row.l3ItemId,
          qty: String(row.qty),
        }))
      )

      setMessage(`BOM saved and reloaded. Showing ${reloadData.length} L3 row(s).`)
    } catch (err) {
      setMessage('')
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  function QtyInput({
    value,
    unit,
    onChange,
    placeholder,
  }: {
    value: string
    unit: string
    onChange: (value: string) => void
    placeholder: string
  }) {
    return (
      <div className="flex rounded-xl border bg-white">
        <input
          type="number"
          step="0.001"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-l-xl px-3 py-2 outline-none"
        />
        <div className="flex min-w-[60px] items-center justify-center rounded-r-xl border-l bg-slate-100 px-3 text-sm font-medium text-slate-800">
          {unit || 'unit'}
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-semibold text-slate-900">BOM Builder</h1>
        <p className="mt-2 text-slate-800">
          Select a parent item and manage its child components.
        </p>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="mt-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700 whitespace-pre-wrap">
            {message}
          </div>
        ) : null}

        <div className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <label className="mb-2 block text-sm font-medium text-slate-900">Parent Item</label>
          <select
            value={parentId}
            onChange={(e) => {
              setParentId(e.target.value)
              setMessage('')
              setError('')
            }}
            className="w-full rounded-xl border px-3 py-2"
          >
            <option value="">Select parent item</option>
            {[...l1Items, ...l2Items].map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} [{item.sku}] ({item.itemType})
              </option>
            ))}
          </select>
        </div>

        {loading ? <div className="mt-6 text-sm text-slate-700">Loading BOM…</div> : null}

        {parentItem?.itemType === 'L1' ? (
          <div className="mt-8 space-y-8">
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-900">L1 → L2</h2>
                <button
                  type="button"
                  onClick={() => addRow(setL1ToL2Rows)}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-white"
                >
                  Add L2 Row
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {l1ToL2Rows.map((row, index) => (
                  <div key={index} className="grid gap-3 md:grid-cols-[1fr_220px_100px]">
                    <select
                      value={row.childId}
                      onChange={(e) =>
                        updateRow(l1ToL2Rows, setL1ToL2Rows, index, 'childId', e.target.value)
                      }
                      className="rounded-xl border px-3 py-2"
                    >
                      <option value="">Select L2</option>
                      {l2Items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} [{item.sku}]
                        </option>
                      ))}
                    </select>

                    <QtyInput
                      value={row.qty}
                      unit={getUnit(row.childId)}
                      placeholder="Qty per portion"
                      onChange={(value) =>
                        updateRow(l1ToL2Rows, setL1ToL2Rows, index, 'qty', value)
                      }
                    />

                    <button
                      type="button"
                      onClick={() => removeRow(l1ToL2Rows, setL1ToL2Rows, index)}
                      className="rounded-xl border px-3 py-2"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-900">L1 → L3</h2>
                <button
                  type="button"
                  onClick={() => addRow(setL1ToL3Rows)}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-white"
                >
                  Add L3 Row
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {l1ToL3Rows.map((row, index) => (
                  <div key={index} className="grid gap-3 md:grid-cols-[1fr_220px_100px]">
                    <select
                      value={row.childId}
                      onChange={(e) =>
                        updateRow(l1ToL3Rows, setL1ToL3Rows, index, 'childId', e.target.value)
                      }
                      className="rounded-xl border px-3 py-2"
                    >
                      <option value="">Select L3</option>
                      {l3Items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} [{item.sku}]
                        </option>
                      ))}
                    </select>

                    <QtyInput
                      value={row.qty}
                      unit={getUnit(row.childId)}
                      placeholder="Qty per portion"
                      onChange={(value) =>
                        updateRow(l1ToL3Rows, setL1ToL3Rows, index, 'qty', value)
                      }
                    />

                    <button
                      type="button"
                      onClick={() => removeRow(l1ToL3Rows, setL1ToL3Rows, index)}
                      className="rounded-xl border px-3 py-2"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <button
              type="button"
              onClick={saveL1}
              className="rounded-xl bg-slate-900 px-5 py-3 text-white"
            >
              Save L1 BOM
            </button>
          </div>
        ) : null}

        {parentItem?.itemType === 'L2' ? (
          <div className="mt-8 space-y-8">
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-900">L2 → L3</h2>
                <button
                  type="button"
                  onClick={() => addRow(setL2ToL3Rows)}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-white"
                >
                  Add L3 Row
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {l2ToL3Rows.map((row, index) => (
                  <div key={index} className="grid gap-3 md:grid-cols-[1fr_220px_100px]">
                    <select
                      value={row.childId}
                      onChange={(e) =>
                        updateRow(l2ToL3Rows, setL2ToL3Rows, index, 'childId', e.target.value)
                      }
                      className="rounded-xl border px-3 py-2"
                    >
                      <option value="">Select L3</option>
                      {l3Items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} [{item.sku}]
                        </option>
                      ))}
                    </select>

                    <QtyInput
                      value={row.qty}
                      unit={getUnit(row.childId)}
                      placeholder="Qty per batch"
                      onChange={(value) =>
                        updateRow(l2ToL3Rows, setL2ToL3Rows, index, 'qty', value)
                      }
                    />

                    <button
                      type="button"
                      onClick={() => removeRow(l2ToL3Rows, setL2ToL3Rows, index)}
                      className="rounded-xl border px-3 py-2"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <button
              type="button"
              onClick={saveL2}
              className="rounded-xl bg-slate-900 px-5 py-3 text-white"
            >
              Save L2 BOM
            </button>
          </div>
        ) : null}
      </div>
    </main>
  )
}