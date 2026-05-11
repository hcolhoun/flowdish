'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

type Item = {
  id: string
  sku: string
  name: string
  itemType: 'L1' | 'L2' | 'L3'
  unitType: 'g' | 'ml' | 'each'
  shelfLifeDays: number | null
  sellingPrice: number | null
  standardBatchOutput: number | null
  buildStatus: 'UNBUILT' | 'BUILT'
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

  const [sku, setSku] = useState('')
  const [skuEdited, setSkuEdited] = useState(false)
  const [name, setName] = useState('')
  const [itemType, setItemType] = useState<'L1' | 'L2' | 'L3'>('L3')
  const [unitType, setUnitType] = useState<'g' | 'ml' | 'each'>('g')
  const [shelfLifeDays, setShelfLifeDays] = useState('')

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'L1' | 'L2' | 'L3'>('ALL')
  const [buildFilter, setBuildFilter] = useState<'ALL' | 'BUILT' | 'UNBUILT'>('ALL')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()

    return items.filter((item) => {
      const matchesType = typeFilter === 'ALL' || item.itemType === typeFilter
      const matchesBuild =
        buildFilter === 'ALL' ||
        item.itemType === 'L3' ||
        item.buildStatus === buildFilter

      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q)

      return matchesType && matchesBuild && matchesSearch
    })
  }, [items, search, typeFilter, buildFilter])

  async function safeJson(res: Response) {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 1000))
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

  function displayValue(value: number | null) {
    return value === null || value === undefined ? 'N/A' : String(value)
  }

  function buildBadge(item: Item) {
    if (item.itemType === 'L3') {
      return (
        <span className="rounded-lg bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-500">
          N/A
        </span>
      )
    }

    if (item.buildStatus === 'BUILT') {
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

  async function loadItems() {
    const res = await fetch('/api/items', { cache: 'no-store' })
    const data = await safeJson(res)

    if (!res.ok) {
      throw new Error(data.error || 'Failed to load items')
    }

    setItems(data)
  }

  async function loadData() {
    try {
      setLoading(true)
      setError('')
      await loadItems()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      scrollToMessage()
    } finally {
      setLoading(false)
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
          unitType: itemType === 'L1' ? 'each' : unitType,
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
      setMessage(
        data.itemType === 'L1' || data.itemType === 'L2'
          ? `Item saved as Unbuilt. Build it in BOM Builder. SKU: ${data.sku}`
          : `Item saved. SKU: ${data.sku}`
      )
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

      setMessage('Item deleted.')
      scrollToMessage()
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      scrollToMessage()
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Items</h1>
          <p className="mt-2 text-slate-800">
            Create L1, L2, and L3 items. L1 selling price and L2 standard batch output are now set in BOM Builder.
          </p>
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
        </form>

        <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[1fr_180px_180px]">
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
                onChange={(e) => setTypeFilter(e.target.value as 'ALL' | 'L1' | 'L2' | 'L3')}
                className="w-full rounded-xl border px-3 py-2"
              >
                <option value="ALL">All</option>
                <option value="L1">L1</option>
                <option value="L2">L2</option>
                <option value="L3">L3</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">Build</label>
              <select
                value={buildFilter}
                onChange={(e) => setBuildFilter(e.target.value as 'ALL' | 'BUILT' | 'UNBUILT')}
                className="w-full rounded-xl border px-3 py-2"
              >
                <option value="ALL">All</option>
                <option value="UNBUILT">Unbuilt</option>
                <option value="BUILT">Built</option>
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
                  <th className="px-4 py-3 text-slate-800">Build</th>
                  <th className="px-4 py-3 text-slate-800">Unit</th>
                  <th className="px-4 py-3 text-slate-800">Shelf Life</th>
                  <th className="px-4 py-3 text-slate-800">Selling Price</th>
                  <th className="px-4 py-3 text-slate-800">Std Batch Output</th>
                  <th className="px-4 py-3 text-slate-800">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredItems.length === 0 ? (
                  <tr className="border-t">
                    <td className="px-4 py-3 text-slate-700" colSpan={9}>
                      No items found.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="px-4 py-3 text-slate-800">{item.sku}</td>
                      <td className="px-4 py-3 text-slate-800">{item.name}</td>
                      <td className="px-4 py-3 text-slate-800">{item.itemType}</td>
                      <td className="px-4 py-3">{buildBadge(item)}</td>
                      <td className="px-4 py-3 text-slate-800">
                        {item.itemType === 'L1' ? 'each' : item.unitType}
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
                        {item.itemType === 'L2' ? displayValue(item.standardBatchOutput) : 'N/A'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {item.itemType === 'L1' || item.itemType === 'L2' ? (
                            <Link
                              href={`/bom?itemId=${item.id}`}
                              className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-800 hover:bg-slate-50"
                            >
                              Build BOM
                            </Link>
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">
          L1 and L2 items are created as <strong>Unbuilt</strong>. Use BOM Builder to add recipes,
          selling price, and batch output, then press <strong>Save as Built</strong>.
        </div>
      </div>
    </main>
  )
}