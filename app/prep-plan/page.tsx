'use client'

import { useEffect, useState } from 'react'

type Forecast = {
  id: string
  name: string
  startDate: string
  endDate: string
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
  currentStock: number
  shortfallQty: number
  standardBatchOutput: number | null
  batchesToPrep: number
  shelfLifeDays: number | null
}

type PlanResponse = {
  forecast: Forecast
  l1Plan: L1PlanRow[]
  l2Plan: L2PlanRow[]
}

export default function PrepPlanPage() {
  const [forecasts, setForecasts] = useState<Forecast[]>([])
  const [forecastId, setForecastId] = useState('')
  const [plan, setPlan] = useState<PlanResponse | null>(null)
  const [error, setError] = useState('')

  async function safeJson(res: Response) {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 500))
    }
  }

  async function loadForecasts() {
    try {
      setError('')
      const res = await fetch('/api/forecasts', { cache: 'no-store' })
      const data = await safeJson(res)

      if (!res.ok) throw new Error(data?.error || 'Failed to load forecasts')

      setForecasts(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    loadForecasts()
  }, [])

  async function generatePlan() {
    if (!forecastId) return

    try {
      setError('')
      setPlan(null)

      const res = await fetch(`/api/prep-plan?forecastId=${forecastId}`, {
        cache: 'no-store',
      })

      const data = await safeJson(res)

      if (!res.ok) throw new Error(data?.error || 'Failed to generate prep plan')

      setPlan(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-semibold">Prep Plan</h1>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">
            {error}
          </div>
        ) : null}

        <div className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <label className="mb-2 block text-sm font-medium">Forecast</label>
          <div className="flex gap-3">
            <select
              value={forecastId}
              onChange={(e) => setForecastId(e.target.value)}
              className="flex-1 rounded-xl border px-3 py-2"
            >
              <option value="">Select forecast</option>
              {forecasts.map((forecast) => (
                <option key={forecast.id} value={forecast.id}>
                  {forecast.name} ({new Date(forecast.startDate).toLocaleDateString('en-GB')} - {new Date(forecast.endDate).toLocaleDateString('en-GB')})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={generatePlan}
              className="rounded-xl bg-slate-900 px-5 py-2 text-white"
            >
              Generate Plan
            </button>
          </div>
        </div>

        {plan ? (
          <div className="mt-8 space-y-8">
            <section className="rounded-2xl border bg-white shadow-sm">
              <div className="border-b px-6 py-4">
                <h2 className="text-xl font-semibold">L1 Forecast Summary</h2>
              </div>

              <div className="overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-sm">
                    <tr>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Forecast</th>
                      <th className="px-4 py-3">Makeable</th>
                      <th className="px-4 py-3">Shortfall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.l1Plan.map((row) => (
                      <tr key={row.itemId} className="border-t">
                        <td className="px-4 py-3">{row.sku}</td>
                        <td className="px-4 py-3">{row.name}</td>
                        <td className="px-4 py-3">{row.forecastQty}</td>
                        <td className="px-4 py-3">{row.makeableQty}</td>
                        <td className="px-4 py-3">{row.shortfallQty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border bg-white shadow-sm">
              <div className="border-b px-6 py-4">
                <h2 className="text-xl font-semibold">L2 Prep List</h2>
              </div>

              <div className="overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-sm">
                    <tr>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Required</th>
                      <th className="px-4 py-3">Current Stock</th>
                      <th className="px-4 py-3">Shortfall</th>
                      <th className="px-4 py-3">Std Batch Output</th>
                      <th className="px-4 py-3">Batches to Prep</th>
                      <th className="px-4 py-3">Shelf Life Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.l2Plan.map((row) => (
                      <tr key={row.itemId} className="border-t">
                        <td className="px-4 py-3">{row.sku}</td>
                        <td className="px-4 py-3">{row.name}</td>
                        <td className="px-4 py-3">{row.requiredQty}</td>
                        <td className="px-4 py-3">{row.currentStock}</td>
                        <td className="px-4 py-3">{row.shortfallQty}</td>
                        <td className="px-4 py-3">{row.standardBatchOutput ?? ''}</td>
                        <td className="px-4 py-3">{row.batchesToPrep}</td>
                        <td className="px-4 py-3">{row.shelfLifeDays ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  )
}