'use client'

import { useEffect, useMemo, useState } from 'react'

type Reading = {
  id: string
  temperatureC: number
  humidity: number | null
  source: string | null
  recordedAt: string
  createdAt: string
}

type Monitor = {
  id: string
  name: string
  location: string | null
  storageType: string
  active: boolean
  minTempC: number | null
  maxTempC: number | null
  readings: Reading[]
  latestReading: Reading | null
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'No reading'

  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function tempLabel(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(1)}°C`
}

function statusForMonitor(monitor: Monitor) {
  const latest = monitor.latestReading

  if (!latest) return { label: 'No reading', className: 'bg-slate-100 text-slate-700' }

  const temp = latest.temperatureC

  if (monitor.minTempC !== null && temp < monitor.minTempC) {
    return { label: 'Too cold', className: 'bg-amber-100 text-amber-800' }
  }

  if (monitor.maxTempC !== null && temp > monitor.maxTempC) {
    return { label: 'Too warm', className: 'bg-red-100 text-red-800' }
  }

  return { label: 'OK', className: 'bg-green-100 text-green-800' }
}

export default function ColdStoragePage() {
  const [monitors, setMonitors] = useState<Monitor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const allReadings = useMemo(() => {
    return monitors
      .flatMap((monitor) =>
        monitor.readings.map((reading) => ({
          ...reading,
          monitorName: monitor.name,
          location: monitor.location,
        }))
      )
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
      .slice(0, 100)
  }, [monitors])

  async function safeJson(res: Response) {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 1000))
    }
  }

  async function loadData() {
    try {
      setLoading(true)
      setError('')

      const res = await fetch('/api/cold-storage', { cache: 'no-store' })
      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load cold storage')
      }

      setMonitors(data.monitors || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Cold Storage</h1>
            <p className="mt-2 text-sm text-slate-700">
              Monitor fridges, freezers, and blast chillers from connected temperature probes.
            </p>
          </div>

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="rounded-xl border bg-white px-4 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {error ? (
          <div className="mt-4 whitespace-pre-wrap rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {monitors.length === 0 && !loading ? (
            <div className="rounded-2xl border bg-white p-6 text-sm text-slate-700 shadow-sm">
              No cold storage monitors have been added yet.
            </div>
          ) : null}

          {monitors.map((monitor) => {
            const latest = monitor.latestReading
            const status = statusForMonitor(monitor)

            return (
              <div key={monitor.id} className="rounded-2xl border bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">{monitor.name}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {monitor.location || 'No location'} · {monitor.storageType}
                    </p>
                  </div>

                  <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${status.className}`}>
                    {status.label}
                  </span>
                </div>

                <div className="mt-6 text-4xl font-semibold text-slate-900">
                  {tempLabel(latest?.temperatureC)}
                </div>

                <div className="mt-2 text-sm text-slate-600">
                  Last reading: {formatDateTime(latest?.recordedAt)}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">Min</div>
                    <div className="font-semibold text-slate-900">{tempLabel(monitor.minTempC)}</div>
                  </div>

                  <div className="rounded-xl border bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">Max</div>
                    <div className="font-semibold text-slate-900">{tempLabel(monitor.maxTempC)}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-xl font-semibold text-slate-900">Recent Readings</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-4 py-3">Monitor</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Temperature</th>
                  <th className="px-4 py-3">Humidity</th>
                  <th className="px-4 py-3">Recorded</th>
                  <th className="px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {allReadings.length === 0 ? (
                  <tr className="border-t">
                    <td className="px-4 py-3 text-slate-700" colSpan={6}>
                      No readings yet.
                    </td>
                  </tr>
                ) : (
                  allReadings.map((reading) => (
                    <tr key={reading.id} className="border-t">
                      <td className="px-4 py-3 text-slate-800">{reading.monitorName}</td>
                      <td className="px-4 py-3 text-slate-800">{reading.location || ''}</td>
                      <td className="px-4 py-3 text-slate-800">
                        {tempLabel(reading.temperatureC)}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {reading.humidity === null ? '' : `${reading.humidity.toFixed(1)}%`}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {formatDateTime(reading.recordedAt)}
                      </td>
                      <td className="px-4 py-3 text-slate-800">{reading.source || ''}</td>
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
