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

type ChartRange = '24h' | '7d' | '30d' | '3m' | 'all'

const chartRangeOptions: Array<{ value: ChartRange; label: string }> = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '3m', label: 'Last 3 months' },
  { value: 'all', label: 'All readings' },
]

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

function tempText(value: number | null | undefined) {
  if (value === null || value === undefined) return '-'
  return `${value.toFixed(1)} C`
}

function rangeStart(range: ChartRange) {
  const now = new Date()

  if (range === '24h') return new Date(now.getTime() - 24 * 60 * 60 * 1000)
  if (range === '7d') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  if (range === '30d') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  if (range === '3m') {
    const start = new Date(now)
    start.setMonth(start.getMonth() - 3)
    return start
  }

  return null
}

function readingsForRange(readings: Reading[], range: ChartRange) {
  const start = rangeStart(range)

  return readings
    .filter((reading) => !start || new Date(reading.recordedAt) >= start)
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())
}

function TemperatureTrend({ monitor, range }: { monitor: Monitor; range: ChartRange }) {
  const readings = readingsForRange(monitor.readings, range)
  const width = 360
  const height = 150
  const padX = 18
  const padY = 20

  if (readings.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border bg-slate-50 text-sm text-slate-500">
        No readings in this range
      </div>
    )
  }

  const temps = readings.map((reading) => reading.temperatureC)
  const limitTemps = [monitor.minTempC, monitor.maxTempC].filter(
    (value): value is number => value !== null
  )
  let minTemp = Math.min(...temps, ...limitTemps)
  let maxTemp = Math.max(...temps, ...limitTemps)

  if (minTemp === maxTemp) {
    minTemp -= 1
    maxTemp += 1
  }

  const firstTime = new Date(readings[0].recordedAt).getTime()
  const lastTime = new Date(readings[readings.length - 1].recordedAt).getTime()
  const timeSpan = Math.max(1, lastTime - firstTime)
  const plotWidth = width - padX * 2
  const plotHeight = height - padY * 2

  function xFor(value: string) {
    return padX + ((new Date(value).getTime() - firstTime) / timeSpan) * plotWidth
  }

  function yFor(value: number) {
    return padY + ((maxTemp - value) / (maxTemp - minTemp)) * plotHeight
  }

  const points = readings
    .map((reading) =>
      `${xFor(reading.recordedAt).toFixed(1)},${yFor(reading.temperatureC).toFixed(1)}`
    )
    .join(' ')

  function limitLine(value: number | null) {
    if (value === null) return null
    const y = yFor(value)

    return (
      <line
        x1={padX}
        x2={width - padX}
        y1={y}
        y2={y}
        stroke="#94a3b8"
        strokeDasharray="4 4"
        strokeWidth="1"
      />
    )
  }

  return (
    <div className="rounded-xl border bg-slate-50 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" role="img">
        <rect x="0" y="0" width={width} height={height} rx="12" fill="#f8fafc" />
        {limitLine(monitor.minTempC)}
        {limitLine(monitor.maxTempC)}
        {readings.length > 1 ? (
          <polyline
            points={points}
            fill="none"
            stroke="#0f172a"
            strokeLinecap="round"
            strokeWidth="3"
          />
        ) : (
          <circle
            cx={xFor(readings[0].recordedAt)}
            cy={yFor(readings[0].temperatureC)}
            fill="#0f172a"
            r="4"
          />
        )}
      </svg>

      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-600">
        <span>{readings.length} reading(s)</span>
        <span>
          {tempText(minTemp)} to {tempText(maxTemp)}
        </span>
      </div>
    </div>
  )
}

export default function ColdStoragePage() {
  const [monitors, setMonitors] = useState<Monitor[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [importMonitorId, setImportMonitorId] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [chartRange, setChartRange] = useState<ChartRange>('24h')

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

      const nextMonitors = data.monitors || []
      setMonitors(nextMonitors)

      if (!importMonitorId && nextMonitors.length > 0) {
        setImportMonitorId(nextMonitors[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  async function importHistory() {
    try {
      setImporting(true)
      setError('')
      setMessage('')

      if (!importMonitorId || !importFile) {
        throw new Error('Choose a monitor and eWeLink history spreadsheet.')
      }

      const formData = new FormData()
      formData.append('monitorId', importMonitorId)
      formData.append('file', importFile)

      const res = await fetch('/api/cold-storage/import-ewelink-history', {
        method: 'POST',
        body: formData,
      })
      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to import eWeLink history')
      }

      const summary = data.summary || {}
      setMessage(
        `Imported ${summary.importedCount || 0} reading(s). ` +
          `${summary.duplicateCount || 0} duplicate(s), ${summary.skippedCount || 0} skipped.`
      )
      setImportFile(null)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setImporting(false)
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

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-sm">
              <span className="sr-only">Graph time span</span>
              <select
                value={chartRange}
                onChange={(event) => setChartRange(event.target.value as ChartRange)}
                className="rounded-xl border bg-white px-3 py-2 text-sm text-slate-800"
              >
                {chartRangeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="rounded-xl border bg-white px-4 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 whitespace-pre-wrap rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="mt-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
            {message}
          </div>
        ) : null}

        <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Import eWeLink History</h2>
              <p className="mt-1 text-sm text-slate-600">
                Upload the exported history spreadsheet when you need inspector records.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(180px,240px)_minmax(220px,1fr)_auto] sm:items-end">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Monitor</span>
                <select
                  value={importMonitorId}
                  onChange={(event) => setImportMonitorId(event.target.value)}
                  className="w-full rounded-xl border bg-white px-3 py-2 text-slate-900"
                  disabled={monitors.length === 0 || importing}
                >
                  {monitors.length === 0 ? <option value="">No monitors</option> : null}
                  {monitors.map((monitor) => (
                    <option key={monitor.id} value={monitor.id}>
                      {monitor.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">eWeLink file</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(event) => setImportFile(event.target.files?.[0] || null)}
                  className="w-full rounded-xl border bg-white px-3 py-2 text-slate-900 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:text-white"
                  disabled={importing}
                />
              </label>

              <button
                type="button"
                onClick={importHistory}
                disabled={importing || monitors.length === 0 || !importFile}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {importing ? 'Importing...' : 'Import History'}
              </button>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-4 xl:grid-cols-2">
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

                <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(180px,220px)_1fr] lg:items-center">
                  <div>
                    <div className="text-xs font-medium uppercase text-slate-500">
                      Last recorded temp
                    </div>
                    <div className="mt-2 text-4xl font-semibold text-slate-900">
                      {tempText(latest?.temperatureC)}
                    </div>

                    <div className="mt-2 text-sm text-slate-600">
                      Last reading: {formatDateTime(latest?.recordedAt)}
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl border bg-slate-50 p-3">
                        <div className="text-xs text-slate-500">Min</div>
                        <div className="font-semibold text-slate-900">{tempText(monitor.minTempC)}</div>
                      </div>

                      <div className="rounded-xl border bg-slate-50 p-3">
                        <div className="text-xs text-slate-500">Max</div>
                        <div className="font-semibold text-slate-900">{tempText(monitor.maxTempC)}</div>
                      </div>
                    </div>
                  </div>

                  <TemperatureTrend monitor={monitor} range={chartRange} />
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
                        {tempText(reading.temperatureC)}
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
