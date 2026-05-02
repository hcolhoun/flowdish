'use client'

import { useEffect, useMemo, useState } from 'react'

type Item = {
  id: string
  sku: string
  name: string
  itemType: 'L1' | 'L2' | 'L3'
}

type ForecastLineInput = {
  itemId: string
  qty: string
}

type Forecast = {
  id: string
  name: string
  startDate: string
  endDate: string
  lines?: Array<{
    id: string
    qty: number
    item: Item
  }>
}

type L1PlanRow = {
  itemId: string
  sku: string
  name: string
  forecastQty: number
  makeableQty: number
  shortfallQty: number
}

type L2PlanRow = {
  itemId: string
  sku: string
  name: string
  requiredQty: number
  totalStock: number
  usableStock: number
  expiringBeforeForecastEnd: number
  expiredStock: number
  shortfallQty: number
  standardBatchOutput: number | null
  batchesToPrep: number
  shelfLifeDays: number | null
  nextExpiry: string | null
  daysToNextExpiry: number | null
  expiryStatus: string
}

type PlanResponse = {
  forecast: Forecast
  l1Plan: L1PlanRow[]
  l2Plan: L2PlanRow[]
}

export default function PlanningPage() {
  const [items, setItems] = useState<Item[]>([])
  const [forecasts, setForecasts] = useState<Forecast[]>([])
  const [selectedForecastId, setSelectedForecastId] = useState('')
  const [plan, setPlan] = useState<PlanResponse | null>(null)

  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [lines, setLines] = useState<ForecastLineInput[]>([{ itemId: '', qty: '1' }])

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const selectedForecast = useMemo(
    () => forecasts.find((forecast) => forecast.id === selectedForecastId) ?? null,
    [forecasts, selectedForecastId]
  )

  async function safeJson(res: Response) {
    const text = await res.text()

    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 500))
    }
  }

  function formatDate(value: string | null | undefined) {
    if (!value) return ''
    return new Date(value).toLocaleDateString('en-GB')
  }

  function formatNumber(value: number) {
    return Number.isInteger(value) ? String(value) : value.toFixed(2)
  }

  async function loadData() {
    try {
      setLoading(true)
      setError('')

      const [itemsRes, forecastsRes] = await Promise.all([
        fetch('/api/items', { cache: 'no-store' }),
        fetch('/api/forecasts', { cache: 'no-store' }),
      ])

      const itemsData = await safeJson(itemsRes)
      const forecastsData = await safeJson(forecastsRes)

      if (!itemsRes.ok) throw new Error(itemsData?.error || 'Failed to load items')
      if (!forecastsRes.ok) throw new Error(forecastsData?.error || 'Failed to load forecasts')

      setItems(itemsData.filter((item: Item) => item.itemType === 'L1'))
      setForecasts(forecastsData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  function addLine() {
    setLines((prev) => [...prev, { itemId: '', qty: '1' }])
  }

  function updateLine(index: number, field: 'itemId' | 'qty', value: string) {
    setLines((prev) =>
      prev.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line
      )
    )
  }

  function removeLine(index: number) {
    setLines((prev) => {
      const next = prev.filter((_, lineIndex) => lineIndex !== index)
      return next.length > 0 ? next : [{ itemId: '', qty: '1' }]
    })
  }

  async function saveForecast(e: React.FormEvent) {
    e.preventDefault()

    try {
      setSaving(true)
      setError('')
      setMessage('')
      setPlan(null)

      const validLines = lines
        .filter((line) => line.itemId && Number(line.qty) > 0)
        .map((line) => ({
          itemId: line.itemId,
          qty: Number(line.qty),
        }))

      if (validLines.length === 0) {
        throw new Error('Add at least one valid forecast line.')
      }

      const res = await fetch('/api/forecasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, startDate, endDate, lines: validLines }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save forecast')
      }

      setName('')
      setStartDate('')
      setEndDate('')
      setLines([{ itemId: '', qty: '1' }])
      setSelectedForecastId(data.id)
      setMessage('Forecast saved. You can now generate the prep plan.')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  async function generatePlan(forecastIdOverride?: string) {
    const forecastId = forecastIdOverride || selectedForecastId

    if (!forecastId) {
      setError('Select a forecast first.')
      return
    }

    try {
      setGenerating(true)
      setError('')
      setMessage('')
      setPlan(null)

      const res = await fetch(`/api/prep-plan?forecastId=${forecastId}`, {
        cache: 'no-store',
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to generate prep plan')
      }

      setPlan(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setGenerating(false)
    }
  }

  async function deleteForecast(id: string, label: string) {
    const confirmed = window.confirm(`Delete forecast: ${label}?`)
    if (!confirmed) return

    try {
      setDeletingId(id)
      setError('')
      setMessage('')

      const res = await fetch(`/api/forecasts?id=${id}`, {
        method: 'DELETE',
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to delete forecast')
      }

      if (selectedForecastId === id) {
        setSelectedForecastId('')
        setPlan(null)
      }

      setMessage('Forecast deleted.')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Planning</h1>
            <p className="mt-2 text-sm text-slate-600">
              Create demand forecasts and generate prep plans from one place.
            </p>
          </div>

          {loading ? (
            <div className="rounded-xl border bg-white px-4 py-2 text-sm text-slate-600">
              Loading planning data…
            </div>
          ) : null}
        </div>

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

        <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold text-slate-900">New Forecast</h2>
            <p className="text-sm text-slate-600">
              Forecast L1 dish demand, then use it to calculate L2 prep requirements.
            </p>
          </div>

          <form onSubmit={saveForecast} className="mt-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-900">
                  Forecast Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-900">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-900">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2"
                  required
                />
              </div>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-slate-900">Forecast Lines</h3>

                <button
                  type="button"
                  onClick={addLine}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Add L1 Line
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {lines.map((line, index) => (
                  <div key={index} className="grid gap-3 md:grid-cols-[1fr_180px_100px]">
                    <select
                      value={line.itemId}
                      onChange={(e) => updateLine(index, 'itemId', e.target.value)}
                      className="rounded-xl border px-3 py-2"
                      required
                    >
                      <option value="">Select L1 item</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} [{item.sku}]
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={line.qty}
                      onChange={(e) => updateLine(index, 'qty', e.target.value)}
                      className="rounded-xl border px-3 py-2"
                      placeholder="Forecast qty"
                      required
                    />

                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save Forecast'}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold text-slate-900">Generate Prep Plan</h2>
            <p className="text-sm text-slate-600">
              Select an existing forecast to calculate makeable L1 quantities and L2 prep shortfalls.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-3 md:flex-row">
            <select
              value={selectedForecastId}
              onChange={(e) => {
                setSelectedForecastId(e.target.value)
                setPlan(null)
              }}
              className="flex-1 rounded-xl border px-3 py-2"
            >
              <option value="">Select forecast</option>
              {forecasts.map((forecast) => (
                <option key={forecast.id} value={forecast.id}>
                  {forecast.name} ({formatDate(forecast.startDate)} - {formatDate(forecast.endDate)})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => generatePlan()}
              disabled={!selectedForecastId || generating}
              className="rounded-xl bg-slate-900 px-5 py-2 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generating ? 'Generating…' : 'Generate Plan'}
            </button>
          </div>

          {selectedForecast ? (
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Selected: <span className="font-medium">{selectedForecast.name}</span>
            </div>
          ) : null}
        </section>

        {plan ? (
          <div className="mt-8 space-y-8">
            <section className="rounded-2xl border bg-white shadow-sm">
              <div className="border-b px-6 py-4">
                <h2 className="text-xl font-semibold text-slate-900">L1 Forecast Summary</h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-sm">
                    <tr>
                      <th className="px-4 py-3 text-slate-800">SKU</th>
                      <th className="px-4 py-3 text-slate-800">Name</th>
                      <th className="px-4 py-3 text-slate-800">Forecast</th>
                      <th className="px-4 py-3 text-slate-800">Makeable</th>
                      <th className="px-4 py-3 text-slate-800">Shortfall</th>
                    </tr>
                  </thead>

                  <tbody>
                    {plan.l1Plan.map((row) => (
                      <tr key={row.itemId} className="border-t">
                        <td className="px-4 py-3 text-slate-800">{row.sku}</td>
                        <td className="px-4 py-3 text-slate-800">{row.name}</td>
                        <td className="px-4 py-3 text-slate-800">{formatNumber(row.forecastQty)}</td>
                        <td className="px-4 py-3 text-slate-800">{formatNumber(row.makeableQty)}</td>
                        <td className="px-4 py-3 text-slate-800">{formatNumber(row.shortfallQty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border bg-white shadow-sm">
              <div className="border-b px-6 py-4">
                <h2 className="text-xl font-semibold text-slate-900">L2 Prep List</h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-sm">
                    <tr>
                      <th className="px-4 py-3 text-slate-800">SKU</th>
                      <th className="px-4 py-3 text-slate-800">Name</th>
                      <th className="px-4 py-3 text-slate-800">Required</th>
                      <th className="px-4 py-3 text-slate-800">Total Stock</th>
                      <th className="px-4 py-3 text-slate-800">Usable Stock</th>
                      <th className="px-4 py-3 text-slate-800">Expiring Before End</th>
                      <th className="px-4 py-3 text-slate-800">Expired</th>
                      <th className="px-4 py-3 text-slate-800">Shortfall</th>
                      <th className="px-4 py-3 text-slate-800">Std Batch Output</th>
                      <th className="px-4 py-3 text-slate-800">Batches</th>
                      <th className="px-4 py-3 text-slate-800">Shelf Life</th>
                      <th className="px-4 py-3 text-slate-800">Next Expiry</th>
                      <th className="px-4 py-3 text-slate-800">Days Left</th>
                      <th className="px-4 py-3 text-slate-800">Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {plan.l2Plan.length === 0 ? (
                      <tr className="border-t">
                        <td className="px-4 py-3 text-slate-700" colSpan={14}>
                          No L2 prep required.
                        </td>
                      </tr>
                    ) : (
                      plan.l2Plan.map((row) => (
                        <tr key={row.itemId} className="border-t">
                          <td className="px-4 py-3 text-slate-800">{row.sku}</td>
                          <td className="px-4 py-3 text-slate-800">{row.name}</td>
                          <td className="px-4 py-3 text-slate-800">{formatNumber(row.requiredQty)}</td>
                          <td className="px-4 py-3 text-slate-800">{formatNumber(row.totalStock)}</td>
                          <td className="px-4 py-3 text-slate-800">{formatNumber(row.usableStock)}</td>
                          <td className="px-4 py-3 text-slate-800">
                            {formatNumber(row.expiringBeforeForecastEnd)}
                          </td>
                          <td className="px-4 py-3 text-slate-800">{formatNumber(row.expiredStock)}</td>
                          <td className="px-4 py-3 text-slate-800">{formatNumber(row.shortfallQty)}</td>
                          <td className="px-4 py-3 text-slate-800">
                            {row.standardBatchOutput === null ? '' : formatNumber(row.standardBatchOutput)}
                          </td>
                          <td className="px-4 py-3 text-slate-800">{row.batchesToPrep}</td>
                          <td className="px-4 py-3 text-slate-800">{row.shelfLifeDays ?? ''}</td>
                          <td className="px-4 py-3 text-slate-800">
                            {row.nextExpiry ? formatDate(row.nextExpiry) : ''}
                          </td>
                          <td className="px-4 py-3 text-slate-800">{row.daysToNextExpiry ?? ''}</td>
                          <td className="px-4 py-3 text-slate-800">{row.expiryStatus}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : null}

        <section className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-xl font-semibold text-slate-900">Saved Forecasts</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-100 text-sm">
                <tr>
                  <th className="px-4 py-3 text-slate-800">Name</th>
                  <th className="px-4 py-3 text-slate-800">Start</th>
                  <th className="px-4 py-3 text-slate-800">End</th>
                  <th className="px-4 py-3 text-slate-800">Lines</th>
                  <th className="px-4 py-3 text-slate-800">Actions</th>
                </tr>
              </thead>

              <tbody>
                {forecasts.length === 0 ? (
                  <tr className="border-t">
                    <td className="px-4 py-3 text-slate-700" colSpan={5}>
                      No forecasts yet.
                    </td>
                  </tr>
                ) : (
                  forecasts.map((forecast) => (
                    <tr key={forecast.id} className="border-t">
                      <td className="px-4 py-3 text-slate-800">{forecast.name}</td>
                      <td className="px-4 py-3 text-slate-800">{formatDate(forecast.startDate)}</td>
                      <td className="px-4 py-3 text-slate-800">{formatDate(forecast.endDate)}</td>
                      <td className="px-4 py-3 text-slate-800">
                        {(forecast.lines ?? [])
                          .map((line) => `${line.item.name} (${formatNumber(line.qty)})`)
                          .join(', ')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedForecastId(forecast.id)
                              generatePlan(forecast.id)
                            }}
                            className="rounded-lg border px-3 py-1 text-sm text-slate-800 hover:bg-slate-50"
                          >
                            Plan
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteForecast(forecast.id, forecast.name)}
                            disabled={deletingId === forecast.id}
                            className="rounded-lg border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingId === forecast.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
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