'use client'

import { useEffect, useMemo, useState } from 'react'

type Item = {
  id: string
  sku: string
  name: string
  itemType: 'L1' | 'L2' | 'L3'
  unitType: 'g' | 'ml' | 'each'
}

type Sale = {
  id: string
  soldAt: string
  qty: number
  cost: number
  item: Item
}

function dateInputValue(date: Date) {
  return date.toISOString().slice(0, 10)
}

function previousWeekRange() {
  const now = new Date()
  const day = now.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day

  const thisMonday = new Date(now)
  thisMonday.setDate(now.getDate() + diffToMonday)
  thisMonday.setHours(0, 0, 0, 0)

  const lastMonday = new Date(thisMonday)
  lastMonday.setDate(thisMonday.getDate() - 7)

  const lastSunday = new Date(thisMonday)
  lastSunday.setDate(thisMonday.getDate() - 1)

  return {
    start: dateInputValue(lastMonday),
    end: dateInputValue(lastSunday),
  }
}

export default function SalesPage() {
  const [items, setItems] = useState<Item[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [itemId, setItemId] = useState('')
  const [soldAt, setSoldAt] = useState('')
  const [qty, setQty] = useState('')

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  const summary = useMemo(() => {
    const totalSalesRows = sales.length
    const totalQty = sales.reduce((sum, sale) => sum + Number(sale.qty || 0), 0)
    const totalCost = sales.reduce((sum, sale) => sum + Number(sale.cost || 0), 0)

    const byItem = new Map<
      string,
      {
        itemId: string
        sku: string
        name: string
        qty: number
        cost: number
      }
    >()

    for (const sale of sales) {
      const existing = byItem.get(sale.item.id)

      if (existing) {
        existing.qty += Number(sale.qty || 0)
        existing.cost += Number(sale.cost || 0)
      } else {
        byItem.set(sale.item.id, {
          itemId: sale.item.id,
          sku: sale.item.sku,
          name: sale.item.name,
          qty: Number(sale.qty || 0),
          cost: Number(sale.cost || 0),
        })
      }
    }

    const itemRows = Array.from(byItem.values()).sort((a, b) => b.qty - a.qty)

    return {
      totalSalesRows,
      totalQty,
      totalCost,
      itemRows,
    }
  }, [sales])

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

  function formatDate(value: string | null) {
    if (!value) return ''
    return new Date(value).toLocaleDateString('en-GB')
  }

  function formatNumber(value: number) {
    return Number.isInteger(value) ? String(value) : value.toFixed(3)
  }

  function money(value: number | null | undefined, maximumFractionDigits = 2) {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits,
    }).format(value ?? 0)
  }

  async function loadData(nextStartDate = startDate, nextEndDate = endDate) {
    try {
      setLoading(true)
      setError('')

      const params = new URLSearchParams()

      if (nextStartDate) params.set('startDate', nextStartDate)
      if (nextEndDate) params.set('endDate', nextEndDate)

      const [itemsRes, salesRes] = await Promise.all([
        fetch('/api/items', { cache: 'no-store' }),
        fetch(`/api/sales?${params.toString()}`, { cache: 'no-store' }),
      ])

      const itemsData = await safeJson(itemsRes)
      const salesData = await safeJson(salesRes)

      if (!itemsRes.ok) {
        throw new Error(itemsData?.error || 'Failed to load items')
      }

      if (!salesRes.ok) {
        throw new Error(salesData?.error || 'Failed to load sales')
      }

      setItems(itemsData.filter((item: Item) => item.itemType === 'L1'))
      setSales(salesData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const range = previousWeekRange()
    setStartDate(range.start)
    setEndDate(range.end)
    setSoldAt(todayInputValue())
    loadData(range.start, range.end)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    try {
      setError('')
      setMessage('')
      setSaving(true)

      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          soldAt,
          qty: Number(qty),
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save sale')
      }

      setItemId('')
      setSoldAt(todayInputValue())
      setQty('')
      setMessage('Sale saved and BOM stock consumed.')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  function applyPreviousWeek() {
    const range = previousWeekRange()
    setStartDate(range.start)
    setEndDate(range.end)
    loadData(range.start, range.end)
  }

  function applyThisWeek() {
    const now = new Date()
    const day = now.getDay()
    const diffToMonday = day === 0 ? -6 : 1 - day

    const monday = new Date(now)
    monday.setDate(now.getDate() + diffToMonday)

    setStartDate(dateInputValue(monday))
    setEndDate(dateInputValue(now))
    loadData(dateInputValue(monday), dateInputValue(now))
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Sales</h1>
            <p className="mt-2 text-sm text-slate-700">
              Record L1 sales and assess sales performance by timeframe. L1 sales consume BOM stock.
            </p>
          </div>

          {loading ? (
            <div className="rounded-xl border bg-white px-4 py-2 text-sm text-slate-600">
              Loading sales…
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

        <form
          onSubmit={handleSubmit}
          className="mt-8 grid gap-4 rounded-2xl border bg-white p-6 shadow-sm md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <h2 className="text-xl font-semibold text-slate-900">Record Sale</h2>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">L1 Item</label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            >
              <option value="">Select item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} [{item.sku}]
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">Sold At</label>
            <input
              type="date"
              value={soldAt}
              onChange={(e) => setSoldAt(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">Quantity Sold</label>
            <input
              type="number"
              step="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-slate-900 px-5 py-3 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {saving ? 'Saving…' : 'Save Sale'}
            </button>
          </div>
        </form>

        <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Sales Timeframe</h2>
              <p className="mt-1 text-sm text-slate-700">
                Use this to review last week, this week, or any custom period.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyPreviousWeek}
                className="rounded-xl border px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
              >
                Previous Week
              </button>

              <button
                type="button"
                onClick={applyThisWeek}
                className="rounded-xl border px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
              >
                This Week
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
              />
            </div>

            <button
              type="button"
              onClick={() => loadData()}
              className="rounded-xl bg-slate-900 px-5 py-3 text-white"
            >
              Apply
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Sales Records</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {summary.totalSalesRows}
              </div>
            </div>

            <div className="rounded-xl border bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Total Dishes Sold</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {formatNumber(summary.totalQty)}
              </div>
            </div>

            <div className="rounded-xl border bg-slate-50 p-4">
              <div className="text-xs text-slate-500">BOM Cost Used</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {money(summary.totalCost)}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-xl font-semibold text-slate-900">Sales by Dish</h2>
            <p className="mt-1 text-sm text-slate-700">
              Ranked by quantity sold in the selected timeframe.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-100 text-sm">
                <tr>
                  <th className="px-4 py-3 text-slate-800">L1 Dish</th>
                  <th className="px-4 py-3 text-slate-800">SKU</th>
                  <th className="px-4 py-3 text-slate-800">Qty Sold</th>
                  <th className="px-4 py-3 text-slate-800">BOM Cost Used</th>
                  <th className="px-4 py-3 text-slate-800">Cost / Dish</th>
                </tr>
              </thead>

              <tbody>
                {summary.itemRows.length === 0 ? (
                  <tr className="border-t">
                    <td className="px-4 py-3 text-slate-700" colSpan={5}>
                      No sales in this timeframe.
                    </td>
                  </tr>
                ) : (
                  summary.itemRows.map((row) => (
                    <tr key={row.itemId} className="border-t">
                      <td className="px-4 py-3 text-slate-800">{row.name}</td>
                      <td className="px-4 py-3 text-slate-800">{row.sku}</td>
                      <td className="px-4 py-3 text-slate-800">{formatNumber(row.qty)}</td>
                      <td className="px-4 py-3 text-slate-800">{money(row.cost)}</td>
                      <td className="px-4 py-3 text-slate-800">
                        {row.qty > 0 ? money(row.cost / row.qty, 4) : money(0)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-xl font-semibold text-slate-900">Sales Records</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-100 text-sm">
                <tr>
                  <th className="px-4 py-3 text-slate-800">Date</th>
                  <th className="px-4 py-3 text-slate-800">Item</th>
                  <th className="px-4 py-3 text-slate-800">Qty</th>
                  <th className="px-4 py-3 text-slate-800">Cost Used</th>
                  <th className="px-4 py-3 text-slate-800">Cost / Dish</th>
                </tr>
              </thead>

              <tbody>
                {sales.length === 0 ? (
                  <tr className="border-t">
                    <td className="px-4 py-3 text-slate-700" colSpan={5}>
                      No sales yet.
                    </td>
                  </tr>
                ) : (
                  sales.map((sale) => (
                    <tr key={sale.id} className="border-t">
                      <td className="px-4 py-3 text-slate-800">{formatDate(sale.soldAt)}</td>
                      <td className="px-4 py-3 text-slate-800">
                        {sale.item.name} [{sale.item.sku}]
                      </td>
                      <td className="px-4 py-3 text-slate-800">{sale.qty}</td>
                      <td className="px-4 py-3 text-slate-800">{money(sale.cost)}</td>
                      <td className="px-4 py-3 text-slate-800">
                        {sale.qty > 0 ? money(sale.cost / sale.qty, 4) : money(0)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This view is for operational sales assessment. Later, menu performance will use L0 menus
          to group these sales by active menu.
        </div>
      </div>
    </main>
  )
}