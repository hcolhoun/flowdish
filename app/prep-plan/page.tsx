'use client'

import { useEffect, useState } from 'react'
import CopyableError from '@/app/components/CopyableError'

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

  function formatDate(value: string | null) {
    if (!value) return ''
    return new Date(value).toLocaleDateString('en-GB')
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
        <h1 className="text-3xl font-semibold text-slate-900">Prep Plan</h1>

        {error ? (
          <CopyableError message={error} className="mt-4" />
        ) : null}

        <div className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <label className="mb-2 block text-sm font-medium text-slate-900">
            Forecast
          </label>

          <div className="flex gap-3">
            <select
              value={forecastId}
              onChange={(e) => setForecastId(e.target.value)}
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
                <h2 className="text-xl font-semibold text-slate-900">
                  L1 Forecast Summary
                </h2>
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
                        <td className="px-4 py-3 text-slate-800">{row.forecastQty}</td>
                        <td className="px-4 py-3 text-slate-800">{row.makeableQty}</td>
                        <td className="px-4 py-3 text-slate-800">{row.shortfallQty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border bg-white shadow-sm">
              <div className="border-b px-6 py-4">
                <h2 className="text-xl font-semibold text-slate-900">
                  L2 Prep List
                </h2>
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
                          <td className="px-4 py-3 text-slate-800">{row.requiredQty}</td>
                          <td className="px-4 py-3 text-slate-800">{row.totalStock}</td>
                          <td className="px-4 py-3 text-slate-800">{row.usableStock}</td>
                          <td className="px-4 py-3 text-slate-800">
                            {row.expiringBeforeForecastEnd}
                          </td>
                          <td className="px-4 py-3 text-slate-800">{row.expiredStock}</td>
                          <td className="px-4 py-3 text-slate-800">{row.shortfallQty}</td>
                          <td className="px-4 py-3 text-slate-800">
                            {row.standardBatchOutput ?? ''}
                          </td>
                          <td className="px-4 py-3 text-slate-800">{row.batchesToPrep}</td>
                          <td className="px-4 py-3 text-slate-800">
                            {row.shelfLifeDays ?? ''}
                          </td>
                          <td className="px-4 py-3 text-slate-800">
                            {row.nextExpiry ? formatDate(row.nextExpiry) : ''}
                          </td>
                          <td className="px-4 py-3 text-slate-800">
                            {row.daysToNextExpiry ?? ''}
                          </td>
                          <td className="px-4 py-3 text-slate-800">
                            {row.expiryStatus}
                          </td>
                        </tr>
                      ))
                    )}
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
