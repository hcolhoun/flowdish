'use client'

import Link from 'next/link'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import CopyableError from '@/app/components/CopyableError'

type ItemType = 'L0' | 'L1' | 'L2' | 'L3'
type UnitType = 'g' | 'ml' | 'each'
type BuildStatus = 'UNBUILT' | 'BUILT'
type PrepTimeStatus = 'MISSING' | 'ESTIMATED' | 'CONFIRMED' | 'STALE'

type Item = {
  id: string
  sku: string
  name: string
  itemType: ItemType
  unitType: UnitType
  shelfLifeDays: number | null
  sellingPrice: number | null
  standardBatchOutput: number | null
  buildStatus: BuildStatus
  prepHandsOnMinutes: number | null
  prepElapsedMinutes: number | null
  prepTimeConfidence: number | null
  prepTimeStatus: PrepTimeStatus
}

type CostingRow = {
  itemId: string
  sku: string
  name: string
  sellingPrice: number | null
  foodCost: number
  grossProfit: number | null
  grossMarginPercent: number | null
  foodCostPercent: number | null
  missingCostCount: number
  isEstimated: boolean
  directIngredients: Array<{
    type: 'L3'
    itemId: string
    sku: string
    name: string
    qty: number
    unitType: UnitType
    unitPrice: number | null
    supplier: string | null
    supplierSku: string | null
    supplierProductName: string | null
    lineCost: number | null
    missingReason: string | null
  }>
  prepComponents: Array<{
    type: 'L2'
    itemId: string
    sku: string
    name: string
    qty: number
    unitType: UnitType
    standardBatchOutput: number | null
    batchCost: number
    costPerUnit: number | null
    lineCost: number | null
    missingReason: string | null
    missingCostCount: number
    ingredients: Array<{
      itemId: string
      sku: string
      name: string
      qty: number
      unitType: UnitType
      unitPrice: number | null
      supplier: string | null
      supplierSku: string | null
      supplierProductName: string | null
      lineCost: number | null
      missingReason: string | null
    }>
  }>
}

function slugifyName(name: string) {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function suggestedSku(itemType: ItemType, name: string) {
  if (!name.trim()) return ''
  return `${itemType}-${slugifyName(name)}`
}

export default function ItemsPage() {
  const messageRef = useRef<HTMLDivElement | null>(null)

  const [items, setItems] = useState<Item[]>([])
  const [costingRows, setCostingRows] = useState<CostingRow[]>([])
  const [expandedCostingId, setExpandedCostingId] = useState<string | null>(null)

  const [sku, setSku] = useState('')
  const [skuEdited, setSkuEdited] = useState(false)
  const [name, setName] = useState('')
  const [itemType, setItemType] = useState<ItemType>('L3')
  const [unitType, setUnitType] = useState<UnitType>('g')
  const [shelfLifeDays, setShelfLifeDays] = useState('')

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'ALL' | ItemType>('ALL')

  const [loading, setLoading] = useState(false)
  const [costingLoading, setCostingLoading] = useState(false)
  const [bulkCalculatingPrepTime, setBulkCalculatingPrepTime] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const costingByItemId = useMemo(() => {
    return new Map(costingRows.map((row) => [row.itemId, row]))
  }, [costingRows])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()

    return items.filter((item) => {
      const matchesType = typeFilter === 'ALL' || item.itemType === typeFilter
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q)

      return matchesType && matchesSearch
    })
  }, [items, search, typeFilter])

  async function safeJson(res: Response) {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 500))
    }
  }

  function scrollToMessage() {
    setTimeout(() => {
      messageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  function money(value: number | null | undefined, maximumFractionDigits = 2) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return 'N/A'
    }

    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits,
    }).format(value)
  }

  function percent(value: number | null | undefined) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return 'N/A'
    }

    return `${value.toFixed(1)}%`
  }

  function qty(value: number) {
    return Number.isInteger(value) ? String(value) : value.toFixed(3)
  }

  function displayValue(value: number | null) {
    return value === null || value === undefined ? 'N/A' : String(value)
  }

  function minuteLabel(value: number | null) {
    if (value === null || value === undefined) return 'N/A'
    if (value < 60) return `${qty(value)} min`

    const hours = Math.floor(value / 60)
    const minutes = Math.round(value % 60)
    return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`
  }

  function marginBadge(row: CostingRow | undefined) {
    const margin = row?.grossMarginPercent

    if (margin === null || margin === undefined) {
      return 'bg-slate-100 text-slate-600'
    }

    if (margin >= 70) {
      return 'bg-green-50 text-green-700'
    }

    if (margin >= 60) {
      return 'bg-amber-50 text-amber-700'
    }

    return 'bg-red-50 text-red-700'
  }

  function buildStatusBadge(item: Item) {
    if (item.itemType === 'L3') {
      return <span className="text-slate-500">N/A</span>
    }

    if (
      item.buildStatus === 'BUILT' &&
      (item.itemType !== 'L2' || item.prepTimeStatus === 'CONFIRMED')
    ) {
      return (
        <span className="rounded-lg bg-green-50 px-2 py-1 text-sm font-semibold text-green-700">
          Built
        </span>
      )
    }

    return (
      <span className="rounded-lg bg-amber-50 px-2 py-1 text-sm font-semibold text-amber-700">
        Unbuilt
      </span>
    )
  }

  async function calculateMissingPrepTimes() {
    try {
      setBulkCalculatingPrepTime(true)
      setError('')
      setMessage('Calculating up to five missing L2 prep times...')

      const res = await fetch('/api/l2-prep-time/bulk', { method: 'POST' })
      const data = await safeJson(res)

      if (!res.ok) throw new Error(data?.error || 'Failed to calculate prep times')

      await loadItems()
      setMessage(
        `${data.calculated} L2 prep time(s) estimated. ${data.remaining} still need calculation or confirmation.`
      )
    } catch (err) {
      setMessage('')
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setBulkCalculatingPrepTime(false)
    }
  }

  async function loadItems() {
    const res = await fetch('/api/items', { cache: 'no-store' })
    const data = await safeJson(res)

    if (!res.ok) {
      throw new Error(data.error || 'Failed to load items')
    }

    setItems(data)
  }

  async function loadCosting() {
    const res = await fetch('/api/costing/l1', { cache: 'no-store' })
    const data = await safeJson(res)

    if (!res.ok) {
      throw new Error(data.error || 'Failed to load L1 costing')
    }

    setCostingRows(data)
  }

  async function loadData() {
    try {
      setLoading(true)
      setCostingLoading(true)
      setError('')

      await Promise.all([loadItems(), loadCosting()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      scrollToMessage()
    } finally {
      setLoading(false)
      setCostingLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  function updateSuggestedSku(nextType: ItemType, nextName: string, force = false) {
    if (nextType === 'L3') return

    if (!skuEdited || force) {
      setSku(suggestedSku(nextType, nextName))
    }
  }

  function handleNameChange(nextName: string) {
    setName(nextName)
    updateSuggestedSku(itemType, nextName)
  }

  function handleItemTypeChange(nextType: ItemType) {
    setItemType(nextType)
    setError('')
    setMessage('')
    setSkuEdited(false)

    if (nextType === 'L0' || nextType === 'L1') {
      setUnitType('each')
      setShelfLifeDays('')
      setSku(suggestedSku(nextType, name))
    }

    if (nextType === 'L2') {
      if (unitType === 'each') setUnitType('g')
      setSku(suggestedSku(nextType, name))
    }

    if (nextType === 'L3') {
      if (unitType === 'each') setUnitType('g')
      setSku('')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')

    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku,
          name,
          itemType,
          unitType: itemType === 'L0' || itemType === 'L1' ? 'each' : unitType,
          shelfLifeDays:
            itemType === 'L2' || itemType === 'L3'
              ? shelfLifeDays
                ? Number(shelfLifeDays)
                : null
              : null,
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save item')
      }

      setSku('')
      setSkuEdited(false)
      setName('')
      setItemType('L3')
      setUnitType('g')
      setShelfLifeDays('')
      setMessage(`Item saved. SKU: ${data.sku}`)
      scrollToMessage()
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      scrollToMessage()
    }
  }

  async function handleDelete(id: string, label: string) {
    setError('')
    setMessage('')

    const confirmed = window.confirm(`Delete item: ${label}?`)
    if (!confirmed) return

    try {
      const res = await fetch(`/api/items?id=${id}`, { method: 'DELETE' })
      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete item')
      }

      if (expandedCostingId === id) {
        setExpandedCostingId(null)
      }

      setMessage('Item deleted.')
      scrollToMessage()
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      scrollToMessage()
    }
  }

  async function refreshCosting() {
    try {
      setCostingLoading(true)
      setError('')
      await loadCosting()
      setMessage('L1 costing refreshed.')
      scrollToMessage()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      scrollToMessage()
    } finally {
      setCostingLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Items</h1>
            <p className="mt-2 text-slate-800">
              Create and view L0 menus, L1 dishes, L2 prep items, and L3 bought ingredients.
            </p>
          </div>

          <button
            type="button"
            onClick={refreshCosting}
            disabled={costingLoading}
            className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {costingLoading ? 'Refreshing costing…' : 'Refresh L1 Costing'}
          </button>
        </div>

        <div ref={messageRef}>
          {error ? (
            <CopyableError message={error} className="mt-4" />
          ) : null}

          {message ? (
            <div className="mt-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
              {message}
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="mt-4 rounded-xl border bg-white px-4 py-3 text-sm text-slate-600">
            Loading items…
          </div>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="mt-8 grid gap-4 rounded-2xl border bg-white p-6 shadow-sm md:grid-cols-3"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">Item Type</label>
            <select
              value={itemType}
              onChange={(e) => handleItemTypeChange(e.target.value as ItemType)}
              className="w-full rounded-xl border px-3 py-2"
            >
              <option value="L0">L0 - Menu</option>
              <option value="L1">L1 - Finished dish</option>
              <option value="L2">L2 - Prepared batch item</option>
              <option value="L3">L3 - Bought ingredient</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">Name</label>
            <input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              placeholder={
                itemType === 'L0'
                  ? 'Example: Current À La Carte Menu'
                  : itemType === 'L1'
                    ? 'Example: Hot Sticky Chicken Wings'
                    : ''
              }
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              {itemType === 'L3' ? 'Supplier SKU' : 'SKU'}
            </label>
            <input
              value={sku}
              onChange={(e) => {
                setSku(e.target.value)
                setSkuEdited(true)
              }}
              className="w-full rounded-xl border px-3 py-2"
              placeholder={itemType === 'L3' ? 'Enter supplier SKU' : 'Auto-suggested, editable'}
              required
            />
          </div>

          {itemType === 'L2' || itemType === 'L3' ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Unit Type</label>
              <select
                value={unitType}
                onChange={(e) => setUnitType(e.target.value as UnitType)}
                className="w-full rounded-xl border px-3 py-2"
              >
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="each">each</option>
              </select>
            </div>
          ) : null}

          {itemType === 'L2' || itemType === 'L3' ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Shelf Life Days
              </label>
              <input
                type="number"
                step="1"
                value={shelfLifeDays}
                onChange={(e) => setShelfLifeDays(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
                required
              />
            </div>
          ) : null}

          <div className="flex items-end">
            <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-white">
              Save Item
            </button>
          </div>

          {(itemType === 'L0' || itemType === 'L1' || itemType === 'L2') ? (
            <div className="md:col-span-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {itemType === 'L0'
                ? 'L0 menus are built in BOM Builder by adding L1 dishes.'
                : itemType === 'L1'
                  ? 'L1 selling price is now handled in BOM Builder when costing the dish.'
                  : 'L2 standard batch output is now handled in BOM Builder when building the prep item.'}
            </div>
          ) : null}
        </form>

        <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Search items
              </label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or SKU..."
                className="w-full rounded-xl border px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'ALL' | ItemType)}
                className="w-full rounded-xl border px-3 py-2"
              >
                <option value="ALL">All</option>
                <option value="L0">L0 Menus</option>
                <option value="L1">L1 Dishes</option>
                <option value="L2">L2 Prep</option>
                <option value="L3">L3 Ingredients</option>
              </select>
            </div>
          </div>
        </section>

        <div className="mt-4 flex flex-col gap-3 rounded-xl border bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-700">
            L2 prep times are estimated in batches of five. Review and confirm each estimate in
            BOM Builder before the item is complete.
          </div>
          <button
            type="button"
            onClick={calculateMissingPrepTimes}
            disabled={bulkCalculatingPrepTime}
            className="shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {bulkCalculatingPrepTime ? 'Calculating...' : 'Calculate Missing L2 Prep Times'}
          </button>
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-left">
              <thead className="bg-slate-100 text-sm">
                <tr>
                  <th className="px-4 py-3 text-slate-800">SKU</th>
                  <th className="px-4 py-3 text-slate-800">Name</th>
                  <th className="px-4 py-3 text-slate-800">Type</th>
                  <th className="px-4 py-3 text-slate-800">Build</th>
                  <th className="px-4 py-3 text-slate-800">Unit</th>
                  <th className="px-4 py-3 text-slate-800">Shelf Life</th>
                  <th className="px-4 py-3 text-slate-800">Selling Price</th>
                  <th className="px-4 py-3 text-slate-800">Food Cost</th>
                  <th className="px-4 py-3 text-slate-800">Gross Margin</th>
                  <th className="px-4 py-3 text-slate-800">Std Batch Output</th>
                  <th className="px-4 py-3 text-slate-800">Prep Time</th>
                  <th className="px-4 py-3 text-slate-800">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredItems.length === 0 ? (
                  <tr className="border-t">
                    <td className="px-4 py-3 text-slate-700" colSpan={12}>
                      No items found.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const costing = costingByItemId.get(item.id)
                    const expanded = expandedCostingId === item.id

                    return (
                      <Fragment key={item.id}>
                        <tr className="border-t">
                          <td className="px-4 py-3 text-slate-800">{item.sku}</td>
                          <td className="px-4 py-3 text-slate-800">{item.name}</td>
                          <td className="px-4 py-3 text-slate-800">{item.itemType}</td>
                          <td className="px-4 py-3">{buildStatusBadge(item)}</td>
                          <td className="px-4 py-3 text-slate-800">
                            {item.itemType === 'L0' || item.itemType === 'L1'
                              ? 'N/A'
                              : item.unitType}
                          </td>
                          <td className="px-4 py-3 text-slate-800">
                            {item.itemType === 'L2' || item.itemType === 'L3'
                              ? displayValue(item.shelfLifeDays)
                              : 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-slate-800">
                            {item.itemType === 'L1' ? money(item.sellingPrice) : 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-slate-800">
                            {item.itemType === 'L1' && costing ? (
                              <>
                                {money(costing.foodCost)}
                                {costing.isEstimated ? (
                                  <span className="ml-2 text-xs text-amber-700">estimated</span>
                                ) : null}
                              </>
                            ) : (
                              'N/A'
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {item.itemType === 'L1' && costing ? (
                              <span
                                className={`rounded-lg px-2 py-1 text-sm font-semibold ${marginBadge(
                                  costing
                                )}`}
                              >
                                {percent(costing.grossMarginPercent)}
                              </span>
                            ) : (
                              <span className="text-slate-500">N/A</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-800">
                            {item.itemType === 'L2'
                              ? displayValue(item.standardBatchOutput)
                              : 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-slate-800">
                            {item.itemType === 'L2' ? (
                              <div className="min-w-40">
                                <div className="font-medium">
                                  {minuteLabel(item.prepHandsOnMinutes)} hands-on
                                </div>
                                <div className="text-xs text-slate-500">
                                  {minuteLabel(item.prepElapsedMinutes)} elapsed
                                </div>
                                <div className="mt-1 text-xs font-medium text-slate-600">
                                  {item.prepTimeStatus}
                                  {item.prepTimeConfidence === null
                                    ? ''
                                    : ` · ${Math.round(item.prepTimeConfidence * 100)}% confidence`}
                                </div>
                              </div>
                            ) : (
                              'N/A'
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              {item.itemType === 'L0' || item.itemType === 'L1' || item.itemType === 'L2' ? (
                                <Link
                                  href={`/bom?parentId=${item.id}`}
                                  className="rounded-lg border border-blue-300 px-3 py-1 text-sm text-blue-700 hover:bg-blue-50"
                                >
                                  Build BOM
                                </Link>
                              ) : null}

                              {item.itemType === 'L1' ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedCostingId(expanded ? null : item.id)
                                  }
                                  className="rounded-lg border px-3 py-1 text-sm text-slate-800 hover:bg-slate-50"
                                >
                                  {expanded ? 'Hide Costing' : 'View Costing'}
                                </button>
                              ) : null}

                              <button
                                type="button"
                                onClick={() => handleDelete(item.id, `${item.name} [${item.sku}]`)}
                                className="rounded-lg border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>

                        {expanded && item.itemType === 'L1' && costing ? (
                          <tr className="border-t bg-slate-50">
                            <td colSpan={12} className="px-4 py-5">
                              <div className="grid gap-4 md:grid-cols-5">
                                <div className="rounded-xl border bg-white p-4">
                                  <div className="text-xs text-slate-500">Selling Price</div>
                                  <div className="mt-1 text-lg font-semibold text-slate-900">
                                    {money(costing.sellingPrice)}
                                  </div>
                                </div>

                                <div className="rounded-xl border bg-white p-4">
                                  <div className="text-xs text-slate-500">Food Cost</div>
                                  <div className="mt-1 text-lg font-semibold text-slate-900">
                                    {money(costing.foodCost)}
                                  </div>
                                </div>

                                <div className="rounded-xl border bg-white p-4">
                                  <div className="text-xs text-slate-500">Food Cost %</div>
                                  <div className="mt-1 text-lg font-semibold text-slate-900">
                                    {percent(costing.foodCostPercent)}
                                  </div>
                                </div>

                                <div className="rounded-xl border bg-white p-4">
                                  <div className="text-xs text-slate-500">Gross Profit</div>
                                  <div className="mt-1 text-lg font-semibold text-slate-900">
                                    {money(costing.grossProfit)}
                                  </div>
                                </div>

                                <div className="rounded-xl border bg-white p-4">
                                  <div className="text-xs text-slate-500">Gross Margin</div>
                                  <div className="mt-1 text-lg font-semibold text-slate-900">
                                    {percent(costing.grossMarginPercent)}
                                  </div>
                                </div>
                              </div>

                              {costing.missingCostCount > 0 ? (
                                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                  This costing is estimated. {costing.missingCostCount} cost input(s)
                                  are missing, usually supplier prices or L2 batch output.
                                </div>
                              ) : (
                                <div className="mt-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
                                  Costing complete. All ingredients have prices and L2 outputs.
                                </div>
                              )}

                              <div className="mt-5 grid gap-6 xl:grid-cols-2">
                                <div className="rounded-xl border bg-white p-4">
                                  <h3 className="font-semibold text-slate-900">
                                    Direct L3 Ingredients
                                  </h3>

                                  <div className="mt-3 overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                      <thead className="bg-slate-100">
                                        <tr>
                                          <th className="px-3 py-2">Ingredient</th>
                                          <th className="px-3 py-2">Qty</th>
                                          <th className="px-3 py-2">Unit Price</th>
                                          <th className="px-3 py-2">Cost</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {costing.directIngredients.length === 0 ? (
                                          <tr className="border-t">
                                            <td className="px-3 py-2 text-slate-600" colSpan={4}>
                                              No direct L3 ingredients.
                                            </td>
                                          </tr>
                                        ) : (
                                          costing.directIngredients.map((line) => (
                                            <tr key={line.itemId} className="border-t">
                                              <td className="px-3 py-2">
                                                <div className="font-medium text-slate-800">
                                                  {line.name}
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                  {line.sku}
                                                  {line.supplier ? ` · ${line.supplier}` : ''}
                                                </div>
                                              </td>
                                              <td className="px-3 py-2">
                                                {qty(line.qty)} {line.unitType}
                                              </td>
                                              <td className="px-3 py-2">
                                                {line.unitPrice === null
                                                  ? 'Missing'
                                                  : `${money(line.unitPrice, 5)} / ${line.unitType}`}
                                              </td>
                                              <td className="px-3 py-2">
                                                {money(line.lineCost)}
                                              </td>
                                            </tr>
                                          ))
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>

                                <div className="rounded-xl border bg-white p-4">
                                  <h3 className="font-semibold text-slate-900">
                                    L2 Prep Components
                                  </h3>

                                  <div className="mt-3 overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                      <thead className="bg-slate-100">
                                        <tr>
                                          <th className="px-3 py-2">Prep Item</th>
                                          <th className="px-3 py-2">Qty</th>
                                          <th className="px-3 py-2">Cost / Unit</th>
                                          <th className="px-3 py-2">Cost</th>
                                          <th className="px-3 py-2">Warnings</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {costing.prepComponents.length === 0 ? (
                                          <tr className="border-t">
                                            <td className="px-3 py-2 text-slate-600" colSpan={5}>
                                              No L2 prep components.
                                            </td>
                                          </tr>
                                        ) : (
                                          costing.prepComponents.map((line) => (
                                            <tr key={line.itemId} className="border-t">
                                              <td className="px-3 py-2">
                                                <div className="font-medium text-slate-800">
                                                  {line.name}
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                  {line.sku}
                                                </div>
                                              </td>
                                              <td className="px-3 py-2">
                                                {qty(line.qty)} {line.unitType}
                                              </td>
                                              <td className="px-3 py-2">
                                                {line.costPerUnit === null
                                                  ? 'Missing'
                                                  : `${money(line.costPerUnit, 5)} / ${line.unitType}`}
                                              </td>
                                              <td className="px-3 py-2">
                                                {money(line.lineCost)}
                                              </td>
                                              <td className="px-3 py-2">
                                                {line.missingCostCount > 0 ? (
                                                  <span className="text-amber-700">
                                                    {line.missingCostCount} missing
                                                  </span>
                                                ) : (
                                                  <span className="text-green-700">Complete</span>
                                                )}
                                              </td>
                                            </tr>
                                          ))
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">
          L0 menus are built from L1 dishes in BOM Builder. L1 food cost uses direct L1 → L3 rows
          plus L1 → L2 prep components expanded through L2 → L3.
        </div>
      </div>
    </main>
  )
}
