'use client'

import { useEffect, useMemo, useState } from 'react'

type Item = {
  id: string
  sku: string
  name: string
  itemType: 'L0' | 'L1' | 'L2' | 'L3'
}

type ForecastLineInput = {
  itemId: string
  qty: string
}

type SalesForecastDraft = {
  name?: string
  lines?: ForecastLineInput[]
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

type IngredientAvailabilityRow = {
  itemId: string
  sku: string
  name: string
  unitType: 'g' | 'ml' | 'each'
  requiredQty: number
  usableStock: number
  shortfallQty: number
  supplier: string | null
  supplierSku: string | null
}

type OrderingSummaryRow = {
  itemId: string
  sku: string
  name: string
  unitType: 'g' | 'ml' | 'each'
  shortfallQty: number
  supplierSku: string | null
}

type OrderingSummaryGroup = {
  supplier: string
  rows: OrderingSummaryRow[]
}

type L2PlanRow = {
  itemId: string
  sku: string
  name: string
  unitType: 'g' | 'ml' | 'each'
  requiredQty: number
  totalStock: number
  usableStock: number
  expiringBeforeForecastEnd: number
  expiredStock: number
  shortfallQty: number
  standardBatchOutput: number | null
  batchesToPrep: number
  prepOutputQty?: number
  shelfLifeDays: number | null
  nextExpiry: string | null
  daysToNextExpiry: number | null
  expiryStatus: string
  canPrepNow?: boolean
  missingIngredientCount?: number
  ingredientAvailability?: IngredientAvailabilityRow[]
}

type PlanResponse = {
  forecast: Forecast
  l1Plan: L1PlanRow[]
  l2Plan: L2PlanRow[]
}

type L0L1BomRow = {
  id: string
  l0ItemId: string
  l1ItemId: string
  qty: number
  l1: Item
}

export default function PlanningPage() {
  const [items, setItems] = useState<Item[]>([])
  const [menus, setMenus] = useState<Item[]>([])
  const [forecasts, setForecasts] = useState<Forecast[]>([])
  const [selectedForecastId, setSelectedForecastId] = useState('')
  const [selectedMenuId, setSelectedMenuId] = useState('')
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
  const [loadingMenu, setLoadingMenu] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const selectedForecast = useMemo(
    () => forecasts.find((forecast) => forecast.id === selectedForecastId) ?? null,
    [forecasts, selectedForecastId]
  )

  const orderingSummary = useMemo<OrderingSummaryGroup[]>(() => {
    if (!plan) return []

    const supplierMap = new Map<string, Map<string, OrderingSummaryRow>>()

    for (const l2Row of plan.l2Plan) {
      for (const ingredient of l2Row.ingredientAvailability ?? []) {
        if (ingredient.shortfallQty <= 0) continue

        const supplier = ingredient.supplier?.trim() || 'Unassigned supplier'
        const supplierRows = supplierMap.get(supplier) ?? new Map<string, OrderingSummaryRow>()
        const rowKey = `${ingredient.itemId}:${ingredient.unitType}`
        const existing = supplierRows.get(rowKey)

        if (existing) {
          existing.shortfallQty += ingredient.shortfallQty
        } else {
          supplierRows.set(rowKey, {
            itemId: ingredient.itemId,
            sku: ingredient.sku,
            name: ingredient.name,
            unitType: ingredient.unitType,
            shortfallQty: ingredient.shortfallQty,
            supplierSku: ingredient.supplierSku,
          })
        }

        supplierMap.set(supplier, supplierRows)
      }
    }

    return Array.from(supplierMap.entries())
      .map(([supplier, rows]) => ({
        supplier,
        rows: Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => {
        if (a.supplier === 'Unassigned supplier') return 1
        if (b.supplier === 'Unassigned supplier') return -1
        return a.supplier.localeCompare(b.supplier)
      })
  }, [plan])

  const orderingSummaryText = useMemo(() => {
    return orderingSummary
      .map((group) => {
        const lines = group.rows.map((row) => {
          const skuText = row.supplierSku ? `Supplier SKU ${row.supplierSku}` : `SKU ${row.sku}`
          return `- ${row.name} (${skuText}): ${formatNumber(row.shortfallQty)} ${row.unitType}`
        })

        return `${group.supplier}\n${lines.join('\n')}`
      })
      .join('\n\n')
  }, [orderingSummary])

  async function safeJson(res: Response) {
    const text = await res.text()

    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 500))
    }
  }

  function todayInputValue() {
    return new Date().toISOString().slice(0, 10)
  }

  function sevenDaysFromTodayInputValue() {
    const date = new Date()
    date.setDate(date.getDate() + 7)
    return date.toISOString().slice(0, 10)
  }

  function formatDate(value: string | null | undefined) {
    if (!value) return ''
    return new Date(value).toLocaleDateString('en-GB')
  }

  function formatNumber(value: number) {
    return Number.isInteger(value) ? String(value) : value.toFixed(3)
  }

  function loadSalesForecastDraft() {
    const rawDraft = window.localStorage.getItem('flowdish:sales-to-forecast')
    if (!rawDraft) return false

    try {
      const draft = JSON.parse(rawDraft) as SalesForecastDraft
      const draftLines = Array.isArray(draft.lines)
        ? draft.lines.filter((line) => line.itemId && Number(line.qty) > 0)
        : []

      if (draftLines.length === 0) return false

      setName(draft.name || 'Forecast from sales')
      setStartDate('')
      setEndDate('')
      setLines(draftLines)
      setSelectedMenuId('')
      setSelectedForecastId('')
      setPlan(null)
      setMessage(`${draftLines.length} sales line(s) loaded into a new forecast. Choose forecast dates before saving.`)
      return true
    } catch {
      return false
    } finally {
      window.localStorage.removeItem('flowdish:sales-to-forecast')
    }
  }

  function statusClass(status: string) {
    if (status === 'MISSING INGREDIENTS') return 'bg-red-100 text-red-800'
    if (status === 'PREP REQUIRED') return 'bg-red-50 text-red-700'
    if (status === 'EXPIRED STOCK') return 'bg-red-50 text-red-700'
    if (status === 'EXPIRING BEFORE FORECAST ENDS') return 'bg-amber-50 text-amber-700'
    if (status === 'USE SOON') return 'bg-amber-50 text-amber-700'
    return 'bg-green-50 text-green-700'
  }

  function ingredientStatusClass(row: IngredientAvailabilityRow) {
    if (row.shortfallQty > 0) return 'bg-red-50 text-red-800'
    return 'bg-green-50 text-green-800'
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
      setMenus(itemsData.filter((item: Item) => item.itemType === 'L0'))
      setForecasts(forecastsData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const loadedSalesDraft = loadSalesForecastDraft()

    if (!loadedSalesDraft) {
      setStartDate(todayInputValue())
      setEndDate(sevenDaysFromTodayInputValue())
    }

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

  async function loadMenuIntoForecast() {
    try {
      setError('')
      setMessage('')
      setPlan(null)
      setLoadingMenu(true)

      if (!selectedMenuId) {
        throw new Error('Select an L0 menu first.')
      }

      const menu = menus.find((item) => item.id === selectedMenuId)

      const res = await fetch(`/api/bom/l0-l1?parentId=${selectedMenuId}`, {
        cache: 'no-store',
      })

      const data = (await safeJson(res)) as L0L1BomRow[] | { error?: string }

      if (!res.ok) {
        throw new Error(
          !Array.isArray(data) ? data?.error || 'Failed to load menu' : 'Failed to load menu'
        )
      }

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('This L0 menu has no L1 dishes yet. Build it in BOM Builder first.')
      }

      setLines(
        data.map((row) => ({
          itemId: row.l1ItemId,
          qty: String(row.qty || 1),
        }))
      )

      if (!name.trim() && menu) {
        setName(`${menu.name} forecast`)
      }

      setMessage(
        `${data.length} L1 dish(es) loaded from ${
          menu?.name || 'selected menu'
        }. Edit quantities before saving.`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoadingMenu(false)
    }
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
      setStartDate(todayInputValue())
      setEndDate(sevenDaysFromTodayInputValue())
      setLines([{ itemId: '', qty: '1' }])
      setSelectedMenuId('')
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

  async function copyOrderingSummary() {
    if (!orderingSummaryText) return

    try {
      await navigator.clipboard.writeText(orderingSummaryText)
      setMessage('Ordering summary copied.')
    } catch {
      setError('Could not copy the ordering summary. Select the text and copy it manually.')
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Planning</h1>
            <p className="mt-2 text-sm text-slate-600">
              Load an L0 menu, forecast L1 sales, and generate prep requirements.
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
          <h2 className="text-xl font-semibold text-slate-900">Load L0 Menu</h2>
          <p className="mt-1 text-sm text-slate-600">
            Select a built L0 menu and pull its L1 dishes into the forecast lines.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">L0 Menu</label>
              <select
                value={selectedMenuId}
                onChange={(e) => setSelectedMenuId(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
              >
                <option value="">Select L0 menu</option>
                {menus.map((menu) => (
                  <option key={menu.id} value={menu.id}>
                    {menu.name} [{menu.sku}]
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={loadMenuIntoForecast}
              disabled={!selectedMenuId || loadingMenu}
              className="rounded-xl bg-slate-900 px-5 py-3 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMenu ? 'Loading Menu…' : 'Load Menu into Forecast'}
            </button>
          </div>

          {menus.length === 0 ? (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              No L0 menus found. Create an L0 item on the Items page, then build it in BOM Builder.
            </div>
          ) : null}
        </section>

        <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">New Forecast</h2>

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
                  placeholder="Optional - auto-generated if blank"
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
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Forecast Lines</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Quantities are expected L1 sales for the selected forecast period.
                  </p>
                </div>

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
                      placeholder="Expected sales"
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
          <h2 className="text-xl font-semibold text-slate-900">Generate Prep Plan</h2>

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
                  {forecast.name} ({formatDate(forecast.startDate)} -{' '}
                  {formatDate(forecast.endDate)})
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
                        <td className="px-4 py-3 text-slate-800">
                          {formatNumber(row.forecastQty)}
                        </td>
                        <td className="px-4 py-3 text-slate-800">
                          {formatNumber(row.makeableQty)}
                        </td>
                        <td className="px-4 py-3 text-slate-800">
                          {formatNumber(row.shortfallQty)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    Summary List for Ordering
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Missing L3 ingredients grouped by supplier, ready to copy into an email.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={copyOrderingSummary}
                  disabled={!orderingSummaryText}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Copy List
                </button>
              </div>

              <div className="px-6 py-5">
                {orderingSummary.length === 0 ? (
                  <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
                    No missing L3 ingredients to order for this forecast.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {orderingSummary.map((group) => (
                      <div key={group.supplier} className="rounded-xl border bg-slate-50 p-4">
                        <h3 className="font-semibold text-slate-900">{group.supplier}</h3>
                        <ul className="mt-3 space-y-2 text-sm text-slate-800">
                          {group.rows.map((row) => (
                            <li key={`${group.supplier}-${row.itemId}-${row.unitType}`}>
                              {row.name}{' '}
                              <span className="text-slate-500">
                                ({row.supplierSku ? `Supplier SKU ${row.supplierSku}` : `SKU ${row.sku}`})
                              </span>
                              : {formatNumber(row.shortfallQty)} {row.unitType}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {orderingSummaryText ? (
                  <textarea
                    value={orderingSummaryText}
                    readOnly
                    className="mt-5 h-56 w-full rounded-xl border bg-white px-3 py-2 font-mono text-sm text-slate-800"
                  />
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border bg-white shadow-sm">
              <div className="border-b px-6 py-4">
                <h2 className="text-xl font-semibold text-slate-900">L2 Prep List</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Required and shortfall quantities are shown in each L2 item’s base unit. Missing
                  L3 ingredients are shown underneath each prep row.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1200px] w-full text-left">
                  <thead className="bg-slate-100 text-sm">
                    <tr>
                      <th className="px-4 py-3 text-slate-800">SKU</th>
                      <th className="px-4 py-3 text-slate-800">Name</th>
                      <th className="px-4 py-3 text-slate-800">Required</th>
                      <th className="px-4 py-3 text-slate-800">Usable Stock</th>
                      <th className="px-4 py-3 text-slate-800">Shortfall</th>
                      <th className="px-4 py-3 text-slate-800">Std Batch Output</th>
                      <th className="px-4 py-3 text-slate-800">Batches</th>
                      <th className="px-4 py-3 text-slate-800">Can Prep?</th>
                      <th className="px-4 py-3 text-slate-800">Next Expiry</th>
                      <th className="px-4 py-3 text-slate-800">Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {plan.l2Plan.length === 0 ? (
                      <tr className="border-t">
                        <td className="px-4 py-3 text-slate-700" colSpan={10}>
                          No L2 prep required.
                        </td>
                      </tr>
                    ) : (
                      plan.l2Plan.map((row) => {
                        const ingredients = row.ingredientAvailability ?? []
                        const missingIngredients = ingredients.filter(
                          (ingredient) => ingredient.shortfallQty > 0
                        )

                        return (
                          <>
                            <tr key={row.itemId} className="border-t align-top">
                              <td className="px-4 py-3 text-slate-800">{row.sku}</td>
                              <td className="px-4 py-3 text-slate-800">{row.name}</td>
                              <td className="px-4 py-3 text-slate-800">
                                {formatNumber(row.requiredQty)} {row.unitType}
                              </td>
                              <td className="px-4 py-3 text-slate-800">
                                {formatNumber(row.usableStock)} {row.unitType}
                              </td>
                              <td className="px-4 py-3 text-slate-800">
                                {formatNumber(row.shortfallQty)} {row.unitType}
                              </td>
                              <td className="px-4 py-3 text-slate-800">
                                {row.standardBatchOutput === null
                                  ? ''
                                  : `${formatNumber(row.standardBatchOutput)} ${row.unitType}`}
                              </td>
                              <td className="px-4 py-3 text-slate-800">{row.batchesToPrep}</td>
                              <td className="px-4 py-3 text-slate-800">
                                {row.shortfallQty <= 0 ? (
                                  <span className="rounded-lg bg-green-50 px-2 py-1 text-sm font-semibold text-green-700">
                                    No prep needed
                                  </span>
                                ) : row.canPrepNow ? (
                                  <span className="rounded-lg bg-green-50 px-2 py-1 text-sm font-semibold text-green-700">
                                    Yes
                                  </span>
                                ) : (
                                  <span className="rounded-lg bg-red-50 px-2 py-1 text-sm font-semibold text-red-700">
                                    No — missing {row.missingIngredientCount ?? 0}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-slate-800">
                                {row.nextExpiry ? formatDate(row.nextExpiry) : ''}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`rounded-lg px-2 py-1 text-sm font-semibold ${statusClass(
                                    row.expiryStatus
                                  )}`}
                                >
                                  {row.expiryStatus}
                                </span>
                              </td>
                            </tr>

                            {row.shortfallQty > 0 ? (
                              <tr className="border-t bg-slate-50">
                                <td colSpan={10} className="px-4 py-4">
                                  <div className="rounded-xl border bg-white p-4">
                                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                      <div>
                                        <h3 className="font-semibold text-slate-900">
                                          L3 ingredient availability for {row.name}
                                        </h3>
                                        <p className="mt-1 text-sm text-slate-600">
                                          Planned prep output:{' '}
                                          {formatNumber(row.prepOutputQty ?? row.shortfallQty)}{' '}
                                          {row.unitType}
                                        </p>
                                      </div>

                                      {missingIngredients.length > 0 ? (
                                        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                                          Cannot prep until missing stock is delivered
                                        </div>
                                      ) : (
                                        <div className="rounded-lg bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
                                          Ingredients available
                                        </div>
                                      )}
                                    </div>

                                    {ingredients.length === 0 ? (
                                      <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                        No L3 ingredient rows found for this L2. Check the L2 BOM.
                                      </div>
                                    ) : (
                                      <div className="mt-4 overflow-x-auto">
                                        <table className="w-full text-left text-sm">
                                          <thead className="bg-slate-100">
                                            <tr>
                                              <th className="px-3 py-2 text-slate-800">Status</th>
                                              <th className="px-3 py-2 text-slate-800">L3 SKU</th>
                                              <th className="px-3 py-2 text-slate-800">L3 Ingredient</th>
                                              <th className="px-3 py-2 text-slate-800">Required</th>
                                              <th className="px-3 py-2 text-slate-800">Available</th>
                                              <th className="px-3 py-2 text-slate-800">Shortfall</th>
                                            </tr>
                                          </thead>

                                          <tbody>
                                            {ingredients.map((ingredient) => (
                                              <tr key={ingredient.itemId} className="border-t">
                                                <td className="px-3 py-2">
                                                  <span
                                                    className={`rounded-lg px-2 py-1 text-xs font-semibold ${ingredientStatusClass(
                                                      ingredient
                                                    )}`}
                                                  >
                                                    {ingredient.shortfallQty > 0
                                                      ? 'Missing'
                                                      : 'Available'}
                                                  </span>
                                                </td>
                                                <td className="px-3 py-2 text-slate-800">
                                                  {ingredient.sku}
                                                </td>
                                                <td className="px-3 py-2 text-slate-800">
                                                  {ingredient.name}
                                                </td>
                                                <td className="px-3 py-2 text-slate-800">
                                                  {formatNumber(ingredient.requiredQty)}{' '}
                                                  {ingredient.unitType}
                                                </td>
                                                <td className="px-3 py-2 text-slate-800">
                                                  {formatNumber(ingredient.usableStock)}{' '}
                                                  {ingredient.unitType}
                                                </td>
                                                <td className="px-3 py-2 text-slate-800">
                                                  {formatNumber(ingredient.shortfallQty)}{' '}
                                                  {ingredient.unitType}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </>
                        )
                      })
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
                      <td className="px-4 py-3 text-slate-800">
                        {formatDate(forecast.startDate)}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {formatDate(forecast.endDate)}
                      </td>
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
