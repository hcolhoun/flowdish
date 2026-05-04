'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'

type Item = {
  id: string
  sku: string
  name: string
  itemType: 'L1' | 'L2' | 'L3'
  unitType: 'g' | 'ml' | 'each'
  shelfLifeDays: number | null
  sellingPrice: number | null
  standardBatchOutput: number | null
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
    unitType: 'g' | 'ml' | 'each'
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
    unitType: 'g' | 'ml' | 'each'
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
      unitType: 'g' | 'ml' | 'each'
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

function suggestedSku(itemType: 'L1' | 'L2' | 'L3', name: string) {
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
  const [itemType, setItemType] = useState<'L1' | 'L2' | 'L3'>('L3')
  const [unitType, setUnitType] = useState<'g' | 'ml' | 'each'>('g')
  const [shelfLifeDays, setShelfLifeDays] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [standardBatchOutput, setStandardBatchOutput] = useState('')

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'L1' | 'L2' | 'L3'>('ALL')

  const [loading, setLoading] = useState(false)
  const [costingLoading, setCostingLoading] = useState(false)
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

  function updateSuggestedSku(nextType: 'L1' | 'L2' | 'L3', nextName: string, force = false) {
    if (nextType === 'L3') return
    if (!skuEdited || force) {
      setSku(suggestedSku(nextType, nextName))
    }
  }

  function handleNameChange(nextName: string) {
    setName(nextName)
    updateSuggestedSku(itemType, nextName)
  }

  function handleItemTypeChange(nextType: 'L1' | 'L2' | 'L3') {
    setItemType(nextType)
    setError('')
    setMessage('')
    setSkuEdited(false)

    if (nextType === 'L1') {
      setUnitType('each')
      setShelfLifeDays('')
      setStandardBatchOutput('')
      setSku(suggestedSku(nextType, name))
    }

    if (nextType === 'L2') {
      setSellingPrice('')
      if (unitType === 'each') setUnitType('g')
      setSku(suggestedSku(nextType, name))
    }

    if (nextType === 'L3') {
      setSellingPrice('')
      setStandardBatchOutput('')
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
          unitType: itemType === 'L1' ? 'each' : unitType,
          shelfLifeDays:
            itemType === 'L2' || itemType === 'L3'
              ? shelfLifeDays
                ? Number(shelfLifeDays)
                : null
              : null,
          sellingPrice: itemType === 'L1' ? (sellingPrice ? Number(sellingPrice) : null) : null,
          standardBatchOutput:
            itemType === 'L2'
              ? standardBatchOutput
                ? Number(standardBatchOutput)
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
      setSellingPrice('')
      setStandardBatchOutput('')
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
              Create and view L1, L2, and L3 items. L1 rows include live food cost and gross margin.
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
            <div className="mt-4 whitespace-pre-wrap rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
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
              onChange={(e) => handleItemTypeChange(e.target.value as 'L1' | 'L2' | 'L3')}
              className="w-full rounded-xl border px-3 py-2"
            >
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

          {itemType !== 'L1' ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Unit Type</label>
              <select
                value={unitType}
                onChange={(e) => setUnitType(e.target.value as 'g' | 'ml' | 'each')}
                className="w-full rounded-xl border px-3 py-2"
              >
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="each">each</option>
              </select>
            </div>
          ) : null}

          {itemType === 'L1' ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Selling Price</label>
              <input
                type="number"
                step="0.01"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
                required
              />
            </div>
          ) : null}

          {itemType === 'L2' || itemType === 'L3' ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Shelf Life Days</label>
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

          {itemType === 'L2' ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Standard Batch Output</label>
              <input
                type="number"
                step="0.001"
                value={standardBatchOutput}
                onChange={(e) => setStandardBatchOutput(e.target.value)}
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
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Type
              </label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'ALL' | 'L1' | 'L2' | 'L3')}
                className="w-full rounded-xl border px-3 py-2"
              >
                <option value="ALL">All</option>
                <option value="L1">L1</option>
                <option value="L2">L2</option>
                <option value="L3">L3</option>
              </select>
            </div>
          </div>
        </section>

        <div className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-100 text-sm">
                <tr>
                  <th className="px-4 py-3 text-slate-800">SKU</th>
                  <th className="px-4 py-3 text-slate-800">Name</th>
                  <th className="px-4 py-3 text-slate-800">Type</th>
                  <th className="px-4 py-3 text-slate-800">Unit</th>
                  <th className="px-4 py-3 text-slate-800">Shelf Life</th>
                  <th className="px-4 py-3 text-slate-800">Selling Price</th>
                  <th className="px-4 py-3 text-slate-800">Food Cost</th>
                  <th className="px-4 py-3 text-slate-800">Gross Margin</th>
                  <th className="px-4 py-3 text-slate-800">Std Batch Output</th>
                  <th className="px-4 py-3 text-slate-800">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredItems.length === 0 ? (
                  <tr className="border-t">
                    <td className="px-4 py-3 text-slate-700" colSpan={10}>
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
                          <td className="px-4 py-3 text-slate-800">
                            {item.itemType === 'L1' ? 'N/A' : item.unitType}
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
                                  <span className="ml-2 text-xs text-amber-700">
                                    estimated
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              'N/A'
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {item.itemType === 'L1' && costing ? (
                              <span
                                className={`rounded-lg px-2 py-1 text-sm font-semibold ${marginBadge(costing)}`}
                              >
                                {percent(costing.grossMarginPercent)}
                              </span>
                            ) : (
                              <span className="text-slate-500">N/A</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-800">
                            {item.itemType === 'L2' ? displayValue(item.standardBatchOutput) : 'N/A'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
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
                            <td colSpan={10} className="px-4 py-5">
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
          L1 food cost uses direct L1 → L3 rows plus L1 → L2 prep components expanded through L2 → L3.
          Supplier prices must be stored as €/g, €/ml, or €/each for accurate costing.
        </div>
      </div>
    </main>
  )
}