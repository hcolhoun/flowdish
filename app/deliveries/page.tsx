'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Item = {
  id: string
  sku: string
  name: string
  itemType: 'L1' | 'L2' | 'L3'
  unitType: 'g' | 'ml' | 'each'
}

type Delivery = {
  id: string
  deliveredAt: string
  qty: number
  unitType: 'g' | 'ml' | 'each'
  supplier: string | null
  price: number | null
  expiryAt: string | null
  item: Item
}

type LatestSupplierProduct = {
  id: string
  supplier: string
  supplierSku: string | null
  name: string
  packSize: string | null
  weight: string | null
  packPrice: number | null
  unitPrice: number | null
}

export default function DeliveriesPage() {
  const [items, setItems] = useState<Item[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])

  const [itemId, setItemId] = useState('')
  const [itemSearch, setItemSearch] = useState('')
  const [itemDropdownOpen, setItemDropdownOpen] = useState(false)

  const [deliveredAt, setDeliveredAt] = useState('')
  const [qty, setQty] = useState('')
  const [supplier, setSupplier] = useState('')
  const [totalCost, setTotalCost] = useState('')
  const [latestSupplierProduct, setLatestSupplierProduct] = useState<LatestSupplierProduct | null>(null)
  const [priceManuallyEdited, setPriceManuallyEdited] = useState(false)
  const [supplierManuallyEdited, setSupplierManuallyEdited] = useState(false)

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loadingPrice, setLoadingPrice] = useState(false)

  const itemPickerRef = useRef<HTMLDivElement | null>(null)

  const selectedItem = items.find((item) => item.id === itemId)

  const filteredItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase()

    if (!query) return items.slice(0, 50)

    return items
      .filter((item) => {
        const haystack = `${item.name} ${item.sku}`.toLowerCase()
        return haystack.includes(query)
      })
      .slice(0, 50)
  }, [items, itemSearch])

  const calculatedUnitCost =
    Number(qty) > 0 && Number(totalCost) > 0
      ? Number(totalCost) / Number(qty)
      : null

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

  function money(value: number | null | undefined, maximumFractionDigits = 2) {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits,
    }).format(value ?? 0)
  }

  function formatUnitPrice(value: number | null | undefined, unitType?: string) {
    if (value === null || value === undefined) return ''
    return `${money(value, 5)} / ${unitType || 'unit'}`
  }

  async function loadData() {
    try {
      setError('')

      const [itemsRes, deliveriesRes] = await Promise.all([
        fetch('/api/items', { cache: 'no-store' }),
        fetch('/api/deliveries', { cache: 'no-store' }),
      ])

      const itemsData = await safeJson(itemsRes)
      const deliveriesData = await safeJson(deliveriesRes)

      if (!itemsRes.ok) throw new Error(itemsData?.error || 'Failed to load items')
      if (!deliveriesRes.ok) throw new Error(deliveriesData?.error || 'Failed to load deliveries')

      setItems(itemsData.filter((item: Item) => item.itemType === 'L3'))
      setDeliveries(deliveriesData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    setDeliveredAt(todayInputValue())
    loadData()
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!itemPickerRef.current) return

      if (!itemPickerRef.current.contains(event.target as Node)) {
        setItemDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!latestSupplierProduct?.unitPrice) return
    if (priceManuallyEdited) return
    if (!qty || Number(qty) <= 0) return

    const calculated = latestSupplierProduct.unitPrice * Number(qty)
    setTotalCost(calculated.toFixed(2))
  }, [qty, latestSupplierProduct?.unitPrice, priceManuallyEdited])

  async function loadLatestSupplierPrice(nextItemId: string) {
    try {
      setLoadingPrice(true)
      setLatestSupplierProduct(null)

      const res = await fetch(`/api/supplier-products/latest?itemId=${nextItemId}`, {
        cache: 'no-store',
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load latest supplier price')
      }

      const product = data.supplierProduct as LatestSupplierProduct | null
      setLatestSupplierProduct(product)

      if (product) {
        if (!supplierManuallyEdited) {
          setSupplier(product.supplier)
        }

        if (!priceManuallyEdited && qty && Number(qty) > 0 && product.unitPrice) {
          setTotalCost((Number(qty) * product.unitPrice).toFixed(2))
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoadingPrice(false)
    }
  }

  function selectItem(item: Item) {
    setItemId(item.id)
    setItemSearch(`${item.name} [${item.sku}]`)
    setItemDropdownOpen(false)
    setPriceManuallyEdited(false)
    setSupplierManuallyEdited(false)
    loadLatestSupplierPrice(item.id)
  }

  function clearSelectedItem() {
    setItemId('')
    setItemSearch('')
    setItemDropdownOpen(false)
    setLatestSupplierProduct(null)
    setSupplier('')
    setTotalCost('')
    setPriceManuallyEdited(false)
    setSupplierManuallyEdited(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    try {
      setError('')
      setMessage('')

      if (!itemId) {
        throw new Error('Select an L3 item.')
      }

      const res = await fetch('/api/deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          deliveredAt,
          qty: Number(qty),
          supplier,
          totalCost: Number(totalCost),
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save delivery')
      }

      setItemId('')
      setItemSearch('')
      setDeliveredAt(todayInputValue())
      setQty('')
      setSupplier('')
      setTotalCost('')
      setLatestSupplierProduct(null)
      setPriceManuallyEdited(false)
      setSupplierManuallyEdited(false)
      setMessage('Delivery saved.')
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  async function handleDelete(id: string, label: string) {
    setError('')
    setMessage('')

    const confirmed = window.confirm(`Delete delivery: ${label}?`)
    if (!confirmed) return

    const res = await fetch(`/api/deliveries?id=${id}`, {
      method: 'DELETE',
    })

    const data = await safeJson(res)

    if (!res.ok) {
      setError(data?.error || 'Failed to delete delivery')
      return
    }

    setMessage('Delivery deleted.')
    loadData()
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-semibold text-slate-900">Deliveries</h1>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">
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
          <div ref={itemPickerRef} className="relative">
            <label className="mb-1 block text-sm font-medium text-slate-900">
              L3 Item
            </label>

            <div className="flex gap-2">
              <input
                value={itemSearch}
                onChange={(e) => {
                  setItemSearch(e.target.value)
                  setItemId('')
                  setLatestSupplierProduct(null)
                  setItemDropdownOpen(true)
                }}
                onFocus={() => setItemDropdownOpen(true)}
                className="w-full rounded-xl border px-3 py-2"
                placeholder="Search by item name or SKU..."
                autoComplete="off"
                required
              />

              {itemId ? (
                <button
                  type="button"
                  onClick={clearSelectedItem}
                  className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Clear
                </button>
              ) : null}
            </div>

            <input type="hidden" value={itemId} required />

            {itemDropdownOpen ? (
              <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border bg-white shadow-lg">
                {filteredItems.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-slate-600">
                    No matching L3 items found.
                  </div>
                ) : (
                  filteredItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectItem(item)}
                      className="block w-full border-b px-4 py-3 text-left hover:bg-slate-50 last:border-b-0"
                    >
                      <div className="font-medium text-slate-900">{item.name}</div>
                      <div className="text-xs text-slate-500">
                        {item.sku} · {item.unitType}
                      </div>
                    </button>
                  ))
                )}

                {items.length > 50 && !itemSearch.trim() ? (
                  <div className="border-t bg-slate-50 px-4 py-2 text-xs text-slate-500">
                    Showing first 50 items. Type to search the full list.
                  </div>
                ) : null}
              </div>
            ) : null}

            {selectedItem ? (
              <p className="mt-2 text-sm text-slate-700">
                Selected: {selectedItem.name} [{selectedItem.sku}]
              </p>
            ) : null}

            {loadingPrice ? (
              <p className="mt-2 text-sm text-slate-600">Loading latest supplier price…</p>
            ) : null}

            {selectedItem && latestSupplierProduct ? (
              <div className="mt-2 rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Latest supplier price: {latestSupplierProduct.supplier} ·{' '}
                {formatUnitPrice(latestSupplierProduct.unitPrice, selectedItem.unitType)}
                {latestSupplierProduct.packPrice ? (
                  <> · Pack {money(latestSupplierProduct.packPrice)}</>
                ) : null}
              </div>
            ) : selectedItem && !loadingPrice ? (
              <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                No linked supplier price found. Enter supplier and total cost manually.
              </div>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              Delivered At
            </label>
            <input
              type="date"
              value={deliveredAt}
              onChange={(e) => setDeliveredAt(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              Quantity Delivered {selectedItem ? `(${selectedItem.unitType})` : ''}
            </label>
            <input
              type="number"
              step="0.001"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              Supplier
            </label>
            <input
              value={supplier}
              onChange={(e) => {
                setSupplier(e.target.value)
                setSupplierManuallyEdited(true)
              }}
              className="w-full rounded-xl border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              Total Delivery Cost (€)
            </label>
            <input
              type="number"
              step="0.01"
              value={totalCost}
              onChange={(e) => {
                setTotalCost(e.target.value)
                setPriceManuallyEdited(true)
              }}
              className="w-full rounded-xl border px-3 py-2"
              required
            />

            {selectedItem && calculatedUnitCost !== null ? (
              <p className="mt-2 text-sm text-slate-700">
                Calculated cost: {money(calculatedUnitCost, 5)} per {selectedItem.unitType}
              </p>
            ) : null}
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-5 py-3 text-white"
            >
              Save Delivery
            </button>
          </div>
        </form>

        <div className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-sm">
              <tr>
                <th className="px-4 py-3 text-slate-800">Date</th>
                <th className="px-4 py-3 text-slate-800">Item</th>
                <th className="px-4 py-3 text-slate-800">Qty</th>
                <th className="px-4 py-3 text-slate-800">Unit</th>
                <th className="px-4 py-3 text-slate-800">Supplier</th>
                <th className="px-4 py-3 text-slate-800">Total Cost</th>
                <th className="px-4 py-3 text-slate-800">Cost / Unit</th>
                <th className="px-4 py-3 text-slate-800">Expiry</th>
                <th className="px-4 py-3 text-slate-800">Actions</th>
              </tr>
            </thead>

            <tbody>
              {deliveries.length === 0 ? (
                <tr className="border-t">
                  <td className="px-4 py-3 text-slate-700" colSpan={9}>
                    No deliveries yet.
                  </td>
                </tr>
              ) : (
                deliveries.map((delivery) => {
                  const unitCost =
                    delivery.price && delivery.qty > 0
                      ? delivery.price / delivery.qty
                      : 0

                  return (
                    <tr key={delivery.id} className="border-t">
                      <td className="px-4 py-3 text-slate-800">
                        {formatDate(delivery.deliveredAt)}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {delivery.item.name} [{delivery.item.sku}]
                      </td>
                      <td className="px-4 py-3 text-slate-800">{delivery.qty}</td>
                      <td className="px-4 py-3 text-slate-800">{delivery.unitType}</td>
                      <td className="px-4 py-3 text-slate-800">{delivery.supplier ?? ''}</td>
                      <td className="px-4 py-3 text-slate-800">{money(delivery.price)}</td>
                      <td className="px-4 py-3 text-slate-800">
                        {money(unitCost, 5)} / {delivery.unitType}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {formatDate(delivery.expiryAt)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            handleDelete(
                              delivery.id,
                              `${delivery.item.name} (${delivery.qty} ${delivery.unitType})`
                            )
                          }
                          className="rounded-lg border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}