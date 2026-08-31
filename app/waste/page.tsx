'use client'

import { useEffect, useMemo, useState } from 'react'
import CopyableError from '@/app/components/CopyableError'
import VoiceDictationButton from '@/app/components/VoiceDictationButton'

type UnitType = 'g' | 'ml' | 'each'
type ItemType = 'L1' | 'L2' | 'L3'

type Item = {
  id: string
  sku: string
  name: string
  itemType: ItemType
  unitType: UnitType
  shelfLifeDays: number | null
  sellingPrice?: number | null
  standardBatchOutput?: number | null
}

type WasteRecord = {
  id: string
  date: string
  itemId: string
  qty: number
  reason: string | null
  createdAt?: string | null
  enteredByName?: string | null
  enteredByType?: string | null
  item: Item
}

type VoiceDraft = {
  transcript: string
  itemId: string | null
  itemName: string | null
  itemSku: string | null
  unitType: UnitType | null
  quantity: number | null
  date: string | null
  reason: string | null
  confidence: number | null
  notes: string | null
  needsReview: boolean
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(value: string) {
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

function enteredByLabel(waste: WasteRecord) {
  const name = waste.enteredByName || 'Unknown'
  const date = formatDateTime(waste.createdAt)

  return date ? `${name} · ${date}` : name
}

export default function WastePage() {
  const [items, setItems] = useState<Item[]>([])
  const [wastes, setWastes] = useState<WasteRecord[]>([])

  const [itemSearch, setItemSearch] = useState('')
  const [selectedItemId, setSelectedItemId] = useState('')
  const [date, setDate] = useState(todayInputValue())
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [voiceProcessing, setVoiceProcessing] = useState(false)
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft | null>(null)

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

    if (!res.ok) {
      throw new Error(data?.error || 'Failed to load items')
    }

    setItems(data)
  }

  async function loadWastes() {
    const res = await fetch('/api/waste', { cache: 'no-store' })
    const data = await safeJson(res)

    if (!res.ok) {
      throw new Error(data?.error || 'Failed to load waste records')
    }

    setWastes(data)
  }

  async function loadPage() {
    try {
      setLoading(true)
      setError('')
      await Promise.all([loadItems(), loadWastes()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPage()
  }, [])

  const l3Items = useMemo(() => {
    return items
      .filter((item) => item.itemType === 'L3')
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [items])

  const selectedItem = useMemo(() => {
    return l3Items.find((item) => item.id === selectedItemId) ?? null
  }, [l3Items, selectedItemId])

  const filteredL3Items = useMemo(() => {
    const q = itemSearch.trim().toLowerCase()

    if (!q) return l3Items.slice(0, 25)

    return l3Items
      .filter((item) => {
        return item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q)
      })
      .slice(0, 25)
  }, [l3Items, itemSearch])

  function selectItem(item: Item) {
    setSelectedItemId(item.id)
    setItemSearch(`${item.name} [${item.sku}]`)
  }

  function clearSelectedItem() {
    setSelectedItemId('')
    setItemSearch('')
  }

  async function handleVoiceTranscript(transcript: string) {
    try {
      setVoiceProcessing(true)
      setError('')
      setMessage('')

      const res = await fetch('/api/parse-voice-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'waste', transcript }),
      })
      const data = (await safeJson(res)) as VoiceDraft & { error?: string }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to prepare the voice draft')
      }

      const matchedItem = l3Items.find((item) => item.id === data.itemId) ?? null

      if (matchedItem) {
        selectItem(matchedItem)
      } else {
        setSelectedItemId('')
        setItemSearch(data.itemName || '')
      }

      if (data.quantity != null) setQty(String(data.quantity))
      if (data.date) setDate(data.date)
      if (data.reason) setReason(data.reason)

      setVoiceDraft(data)
      setMessage('Voice draft ready. Review every field before recording the waste.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown voice-entry error')
    } finally {
      setVoiceProcessing(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    try {
      setError('')
      setMessage('')
      setSaving(true)

      if (!selectedItemId) {
        setError('Choose an L3 item first.')
        return
      }

      const numericQty = Number(qty)

      if (!numericQty || numericQty <= 0) {
        setError('Quantity must be greater than 0.')
        return
      }

      const res = await fetch('/api/waste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: selectedItemId,
          date,
          qty: numericQty,
          reason,
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save waste record')
      }

      setMessage('Waste recorded and inventory reduced.')
      setQty('')
      setReason('')
      setVoiceDraft(null)
      clearSelectedItem()

      await loadWastes()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Waste</h1>
            <p className="mt-2 text-slate-700">
              Record wasted L3 ingredients. Waste entries reduce inventory using FIFO.
            </p>
          </div>

          {loading ? (
            <div className="rounded-xl border bg-white px-4 py-2 text-sm text-slate-600">
              Loading…
            </div>
          ) : null}
        </div>

        {error ? (
          <CopyableError message={error} className="mt-4" />
        ) : null}

        {message ? (
          <div className="sticky top-4 z-40 mt-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700 shadow-sm">
            {message}
          </div>
        ) : null}

        <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Record Waste</h2>
              <p className="mt-1 text-sm text-slate-600">
                Say the item, amount, and reason, then review the draft before saving.
              </p>
            </div>
            <VoiceDictationButton
              onTranscript={handleVoiceTranscript}
              processing={voiceProcessing}
              disabled={loading || saving}
            />
          </div>

          {voiceDraft ? (
            <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-slate-700">
              <div className="font-semibold text-blue-800">Voice draft for review</div>
              <div className="mt-1">
                <span className="font-medium">Heard:</span> {voiceDraft.transcript}
              </div>
              {voiceDraft.itemName ? (
                <div className="mt-1">
                  <span className="font-medium">Item:</span> {voiceDraft.itemName}
                  {voiceDraft.itemSku
                    ? ` [${voiceDraft.itemSku}]`
                    : ' - choose the matching item below'}
                </div>
              ) : null}
              {voiceDraft.notes ? <div className="mt-1">{voiceDraft.notes}</div> : null}
              <div className="mt-2 font-medium text-blue-800">Nothing has been saved yet.</div>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-6 grid gap-5 md:grid-cols-2">
            <div className="relative md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-900">
                L3 Item
              </label>

              <input
                value={itemSearch}
                onChange={(e) => {
                  setItemSearch(e.target.value)
                  setSelectedItemId('')
                }}
                placeholder="Type item name or SKU..."
                className="w-full rounded-xl border px-3 py-2 text-slate-900"
              />

              {itemSearch && !selectedItemId ? (
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border bg-white shadow-lg">
                  {filteredL3Items.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-slate-600">
                      No L3 items found.
                    </div>
                  ) : (
                    filteredL3Items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectItem(item)}
                        className="block w-full border-b px-4 py-3 text-left hover:bg-slate-50"
                      >
                        <div className="font-medium text-slate-900">{item.name}</div>
                        <div className="text-xs text-slate-600">
                          {item.sku} · {item.unitType}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              ) : null}

              {selectedItem ? (
                <div className="mt-2 flex items-center justify-between rounded-xl border bg-slate-50 px-3 py-2 text-sm">
                  <div className="text-slate-700">
                    Selected: <span className="font-medium">{selectedItem.name}</span> ·{' '}
                    {selectedItem.sku} · unit: {selectedItem.unitType}
                  </div>

                  <button
                    type="button"
                    onClick={clearSelectedItem}
                    className="text-red-700 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Quantity {selectedItem ? `(${selectedItem.unitType})` : ''}
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="e.g. 500"
                className="w-full rounded-xl border px-3 py-2 text-slate-900"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Reason
              </label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Expired, damaged, over-prepped, dropped, quality issue..."
                className="w-full rounded-xl border px-3 py-2 text-slate-900"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-slate-900 px-5 py-3 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {saving ? 'Saving…' : 'Record Waste'}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-xl font-semibold text-slate-900">Waste Records</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left">
              <thead className="bg-slate-100 text-sm">
                <tr>
                  <th className="px-4 py-3 text-slate-800">Date</th>
                  <th className="px-4 py-3 text-slate-800">Item</th>
                  <th className="px-4 py-3 text-slate-800">SKU</th>
                  <th className="px-4 py-3 text-slate-800">Quantity</th>
                  <th className="px-4 py-3 text-slate-800">Reason</th>
                  <th className="px-4 py-3 text-slate-800">Entered</th>
                </tr>
              </thead>

              <tbody>
                {wastes.length === 0 ? (
                  <tr className="border-t">
                    <td colSpan={6} className="px-4 py-3 text-slate-700">
                      No waste records yet.
                    </td>
                  </tr>
                ) : (
                  wastes.map((waste) => (
                    <tr key={waste.id} className="border-t">
                      <td className="px-4 py-3 text-slate-800">
                        {formatDate(waste.date)}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {waste.item?.name ?? ''}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {waste.item?.sku ?? ''}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {waste.qty} {waste.item?.unitType ?? ''}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {waste.reason ?? ''}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-slate-500">{enteredByLabel(waste)}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
