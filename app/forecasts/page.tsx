'use client'

import { useEffect, useState } from 'react'
import CopyableError from '@/app/components/CopyableError'

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
  lines: Array<{
    id: string
    qty: number
    item: Item
  }>
}

export default function ForecastsPage() {
  const [items, setItems] = useState<Item[]>([])
  const [forecasts, setForecasts] = useState<Forecast[]>([])
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [lines, setLines] = useState<ForecastLineInput[]>([{ itemId: '', qty: '1' }])
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

  async function loadData() {
    try {
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
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  function addLine() {
    setLines((prev) => [...prev, { itemId: '', qty: '1' }])
  }

  function updateLine(index: number, field: 'itemId' | 'qty', value: string) {
    const next = [...lines]
    next[index] = { ...next[index], [field]: value }
    setLines(next)
  }

  function removeLine(index: number) {
    const next = [...lines]
    next.splice(index, 1)
    setLines(next)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    try {
      setError('')
      setMessage('')

      const res = await fetch('/api/forecasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          startDate,
          endDate,
          lines: lines.map((line) => ({
            itemId: line.itemId,
            qty: Number(line.qty),
          })),
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save forecast')
      }

      setName('')
      setStartDate('')
      setEndDate('')
      setLines([{ itemId: '', qty: '1' }])
      setMessage('Forecast saved.')
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  async function handleDelete(id: string, label: string) {
    setError('')
    setMessage('')

    const confirmed = window.confirm(`Delete forecast: ${label}?`)
    if (!confirmed) return

    const res = await fetch(`/api/forecasts?id=${id}`, {
      method: 'DELETE',
    })

    const data = await safeJson(res)

    if (!res.ok) {
      setError(data?.error || 'Failed to delete forecast')
      return
    }

    setMessage('Forecast deleted.')
    loadData()
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-semibold text-slate-900">Forecasts</h1>

        {error ? (
          <CopyableError message={error} className="mt-4" />
        ) : null}

        {message ? (
          <div className="mt-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
            {message}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Forecast Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">End Date</label>
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
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Forecast Lines</h2>
              <button
                type="button"
                onClick={addLine}
                className="rounded-xl bg-slate-900 px-4 py-2 text-white"
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
                    step="1"
                    value={line.qty}
                    onChange={(e) => updateLine(index, 'qty', e.target.value)}
                    className="rounded-xl border px-3 py-2"
                    placeholder="Forecast qty"
                  />

                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    className="rounded-xl border px-3 py-2"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <button type="submit" className="rounded-xl bg-slate-900 px-5 py-3 text-white">
              Save Forecast
            </button>
          </div>
        </form>

        <div className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
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
              {forecasts.map((forecast) => (
                <tr key={forecast.id} className="border-t">
                  <td className="px-4 py-3 text-slate-800">{forecast.name}</td>
                  <td className="px-4 py-3 text-slate-800">{new Date(forecast.startDate).toLocaleDateString('en-GB')}</td>
                  <td className="px-4 py-3 text-slate-800">{new Date(forecast.endDate).toLocaleDateString('en-GB')}</td>
                  <td className="px-4 py-3 text-slate-800">
                    {forecast.lines.map((line) => `${line.item.name} (${line.qty})`).join(', ')}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleDelete(forecast.id, forecast.name)}
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
