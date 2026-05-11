'use client'

import { useEffect, useMemo, useState } from 'react'

type BuildStatus = 'UNBUILT' | 'BUILT'

type BestSupplierPrice = {
  supplier: string
  supplierSku: string | null
  productName: string
  packSize: string | null
  weight: string | null
  packPrice: number | null
  unitPrice: number | null
}

type Item = {
  id: string
  sku: string
  name: string
  itemType: 'L1' | 'L2' | 'L3'
  unitType: 'g' | 'ml' | 'each'
  shelfLifeDays?: number | null
  sellingPrice?: number | null
  standardBatchOutput?: number | null
  buildStatus?: BuildStatus
  bestSupplierPrice?: BestSupplierPrice | null
}

type SupplierProduct = {
  id: string
  supplier: string
  supplierSku: string | null
  name: string
  packSize: string | null
  weight: string | null
  packPrice: number | null
  unitPrice: number | null
  linkedItemId?: string | null
  linkedItem?: Item | null
}

type ChildRow = {
  childId: string
  qty: string
}

type PriceInfo = {
  unitPrice: number
  supplier: string
  supplierSku: string | null
  productName: string
  packPrice: number | null
  weight: string | null
}

type L2CostInfo = {
  itemId: string
  sku: string
  name: string
  unitType: string
  standardBatchOutput: number | null
  batchCost: number
  costPerUnit: number | null
  missingCostCount: number
}

type BomCostingData = {
  l3PricesByItemId: Record<string, PriceInfo>
  l2CostsByItemId: Record<string, L2CostInfo>
}

function QtyInput({
  value,
  unit,
  onChange,
  placeholder,
}: {
  value: string
  unit: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="flex rounded-xl border bg-white">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-l-xl px-3 py-2 outline-none"
      />
      <div className="flex min-w-[60px] items-center justify-center rounded-r-xl border-l bg-slate-100 px-3 text-sm font-medium text-slate-800">
        {unit || 'unit'}
      </div>
    </div>
  )
}

function L2Picker({
  selectedId,
  l2Items,
  onSelect,
}: {
  selectedId: string
  l2Items: Item[]
  onSelect: (id: string) => void
}) {
  return (
    <select
      value={selectedId}
      onChange={(e) => onSelect(e.target.value)}
      className="rounded-xl border px-3 py-2"
    >
      <option value="">Select L2</option>
      {l2Items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name} [{item.sku}]
        </option>
      ))}
    </select>
  )
}

function L3SearchPicker({
  selectedId,
  l3Items,
  onSelect,
  onError,
}: {
  selectedId: string
  l3Items: Item[]
  onSelect: (id: string) => void
  onError: (message: string) => void
}) {
  const selected = l3Items.find((item) => item.id === selectedId)
  const [query, setQuery] = useState(selected ? `${selected.name} [${selected.sku}]` : '')
  const [open, setOpen] = useState(false)
  const [l3Results, setL3Results] = useState<Item[]>([])
  const [supplierResults, setSupplierResults] = useState<SupplierProduct[]>([])

  useEffect(() => {
    const item = l3Items.find((i) => i.id === selectedId)
    if (item) setQuery(`${item.name} [${item.sku}]`)
  }, [selectedId, l3Items])

  async function safeJson(res: Response) {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 1000))
    }
  }

  async function search(value: string) {
    setQuery(value)
    setOpen(true)

    if (value.trim().length < 2) {
      setL3Results([])
      setSupplierResults([])
      return
    }

    try {
      const res = await fetch(`/api/ingredient-search?q=${encodeURIComponent(value)}`, {
        cache: 'no-store',
      })

      const data = await safeJson(res)

      if (!res.ok) throw new Error(data?.error || 'Search failed')

      setL3Results(data.items ?? [])
      setSupplierResults(data.supplierProducts ?? [])
    } catch {
      setL3Results([])
      setSupplierResults([])
    }
  }

  function money(value: number | null | undefined, maximumFractionDigits = 4) {
    if (value === null || value === undefined) return ''

    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits,
    }).format(value)
  }

  function selectSupplierProduct(product: SupplierProduct) {
    const matchedItem =
      product.linkedItem ||
      (product.linkedItemId
        ? l3Items.find((item) => item.id === product.linkedItemId)
        : null) ||
      l3Items.find((item) => product.supplierSku && item.sku === product.supplierSku)

    if (!matchedItem) {
      onError(
        `Supplier product "${product.name}" is not linked to an L3 item yet. Link it on Supplier Products first.`
      )
      return
    }

    onSelect(matchedItem.id)
    setQuery(`${matchedItem.name} [${matchedItem.sku}]`)
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => search(e.target.value)}
        onFocus={() => setOpen(true)}
        className="w-full rounded-xl border px-3 py-2"
        placeholder="Search L3 ingredient or supplier product"
      />

      {open && (l3Results.length > 0 || supplierResults.length > 0) ? (
        <div className="absolute z-20 mt-1 max-h-96 w-full overflow-auto rounded-xl border bg-white shadow-lg">
          {l3Results.length > 0 ? (
            <div className="border-b px-3 py-2 text-xs font-semibold uppercase text-slate-500">
              Flowdish L3 Items
            </div>
          ) : null}

          {l3Results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelect(item.id)
                setQuery(`${item.name} [${item.sku}]`)
                setOpen(false)
              }}
              className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-slate-100 last:border-b-0"
            >
              <div className="font-medium text-slate-900">
                {item.name} [{item.sku}]
              </div>
              <div className="text-xs text-slate-600">Unit: {item.unitType}</div>
            </button>
          ))}

          {supplierResults.length > 0 ? (
            <div className="border-y px-3 py-2 text-xs font-semibold uppercase text-slate-500">
              Supplier Price Options
            </div>
          ) : null}

          {supplierResults.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => selectSupplierProduct(product)}
              className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-green-50 last:border-b-0"
            >
              <div className="font-medium text-slate-900">{product.name}</div>
              <div className="text-xs text-slate-700">
                {product.supplier} · SKU {product.supplierSku || 'N/A'} · Pack{' '}
                {product.packSize || 'N/A'} · Weight {product.weight || 'N/A'} · Pack Price{' '}
                {money(product.packPrice, 2)}
                {product.linkedItem ? (
                  <> · Linked to {product.linkedItem.name} [{product.linkedItem.sku}]</>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function BomPage() {
  const [items, setItems] = useState<Item[]>([])
  const [costingData, setCostingData] = useState<BomCostingData>({
    l3PricesByItemId: {},
    l2CostsByItemId: {},
  })

  const [parentId, setParentId] = useState('')
  const [sellingPriceInput, setSellingPriceInput] = useState('')
  const [standardBatchOutputInput, setStandardBatchOutputInput] = useState('')

  const [loading, setLoading] = useState(false)
  const [costingLoading, setCostingLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [l1ToL2Rows, setL1ToL2Rows] = useState<ChildRow[]>([])
  const [l1ToL3Rows, setL1ToL3Rows] = useState<ChildRow[]>([])
  const [l2ToL3Rows, setL2ToL3Rows] = useState<ChildRow[]>([])

  async function safeJson(res: Response) {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 1000))
    }
  }

  function money(value: number | null | undefined, maximumFractionDigits = 2) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return '—'
    }

    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits,
    }).format(value)
  }

  function numberLabel(value: number | null | undefined, digits = 3) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return '—'
    }

    return Number.isInteger(value) ? String(value) : value.toFixed(digits)
  }

  function percent(value: number | null | undefined) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return '—'
    }

    return `${value.toFixed(1)}%`
  }

  function getQty(value: string) {
    const number = Number(value)
    return Number.isFinite(number) ? number : 0
  }

  async function loadItems() {
    const res = await fetch('/api/items', { cache: 'no-store' })
    const data = await safeJson(res)

    if (!res.ok) throw new Error(data?.error || 'Failed to load items')
    setItems(data)
  }

  async function loadCosting() {
    try {
      setCostingLoading(true)

      const res = await fetch('/api/bom-costing', { cache: 'no-store' })
      const data = await safeJson(res)

      if (!res.ok) throw new Error(data?.error || 'Failed to load BOM costing')

      setCostingData(data)
    } finally {
      setCostingLoading(false)
    }
  }

  async function loadInitialData() {
    try {
      setError('')
      await Promise.all([loadItems(), loadCosting()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const itemId = params.get('itemId')
    if (itemId) setParentId(itemId)
  }, [])

  const parentItem = useMemo(
    () => items.find((item) => item.id === parentId) ?? null,
    [items, parentId]
  )

  const l1Items = items.filter((item) => item.itemType === 'L1')
  const l2Items = items.filter((item) => item.itemType === 'L2')
  const l3Items = items.filter((item) => item.itemType === 'L3')

  function buildStatusBadge(item: Item | null) {
    if (!item) return null

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

  function getItem(itemId: string) {
    return items.find((item) => item.id === itemId) ?? null
  }

  function getUnit(itemId: string) {
    return getItem(itemId)?.unitType ?? ''
  }

  function getL3Price(itemId: string) {
    return costingData.l3PricesByItemId[itemId] ?? null
  }

  function getL2Cost(itemId: string) {
    return costingData.l2CostsByItemId[itemId] ?? null
  }

  const l2LiveCosting = useMemo(() => {
    if (!parentItem || parentItem.itemType !== 'L2') {
      return null
    }

    let totalBatchCost = 0
    let missingCostCount = 0

    const rows = l2ToL3Rows.map((row) => {
      const item = getItem(row.childId)
      const qty = getQty(row.qty)
      const price = row.childId ? getL3Price(row.childId) : null
      const lineCost = price ? qty * price.unitPrice : null

      if (row.childId && !price) missingCostCount++
      if (lineCost !== null) totalBatchCost += lineCost

      return { row, item, qty, price, lineCost }
    })

    const standardBatchOutput = standardBatchOutputInput
      ? Number(standardBatchOutputInput)
      : parentItem.standardBatchOutput ?? null

    const costPerUnit =
      standardBatchOutput && standardBatchOutput > 0
        ? totalBatchCost / standardBatchOutput
        : null

    if (!standardBatchOutput || standardBatchOutput <= 0) missingCostCount++

    return {
      rows,
      totalBatchCost,
      standardBatchOutput,
      costPerUnit,
      missingCostCount,
    }
  }, [parentItem, l2ToL3Rows, costingData, items, standardBatchOutputInput])

  const l1LiveCosting = useMemo(() => {
    if (!parentItem || parentItem.itemType !== 'L1') return null

    let totalCogs = 0
    let missingCostCount = 0

    const directRows = l1ToL3Rows.map((row) => {
      const item = getItem(row.childId)
      const qty = getQty(row.qty)
      const price = row.childId ? getL3Price(row.childId) : null
      const lineCost = price ? qty * price.unitPrice : null

      if (row.childId && !price) missingCostCount++
      if (lineCost !== null) totalCogs += lineCost

      return { row, item, qty, price, lineCost }
    })

    const prepRows = l1ToL2Rows.map((row) => {
      const item = getItem(row.childId)
      const qty = getQty(row.qty)
      const cost = row.childId ? getL2Cost(row.childId) : null
      const lineCost =
        cost?.costPerUnit !== null && cost?.costPerUnit !== undefined
          ? qty * cost.costPerUnit
          : null

      if (row.childId && (!cost || cost.costPerUnit === null)) missingCostCount++
      if (cost?.missingCostCount) missingCostCount += cost.missingCostCount
      if (lineCost !== null) totalCogs += lineCost

      return { row, item, qty, cost, lineCost }
    })

    const sellingPrice = sellingPriceInput ? Number(sellingPriceInput) : parentItem.sellingPrice ?? null
    const grossProfit = sellingPrice !== null && sellingPrice > 0 ? sellingPrice - totalCogs : null
    const grossMargin =
      sellingPrice !== null && sellingPrice > 0 && grossProfit !== null
        ? (grossProfit / sellingPrice) * 100
        : null
    const foodCostPercent =
      sellingPrice !== null && sellingPrice > 0 ? (totalCogs / sellingPrice) * 100 : null

    return {
      directRows,
      prepRows,
      totalCogs,
      sellingPrice,
      grossProfit,
      grossMargin,
      foodCostPercent,
      missingCostCount,
    }
  }, [parentItem, l1ToL2Rows, l1ToL3Rows, costingData, items, sellingPriceInput])

  useEffect(() => {
    if (!parentItem) {
      setL1ToL2Rows([])
      setL1ToL3Rows([])
      setL2ToL3Rows([])
      setSellingPriceInput('')
      setStandardBatchOutputInput('')
      return
    }

    setSellingPriceInput(
      parentItem.sellingPrice === null || parentItem.sellingPrice === undefined
        ? ''
        : String(parentItem.sellingPrice)
    )
    setStandardBatchOutputInput(
      parentItem.standardBatchOutput === null || parentItem.standardBatchOutput === undefined
        ? ''
        : String(parentItem.standardBatchOutput)
    )

    ;(async () => {
      try {
        setError('')
        setMessage('')
        setLoading(true)

        if (parentItem.itemType === 'L1') {
          const [l1l2Res, l1l3Res] = await Promise.all([
            fetch(`/api/bom/l1-l2?parentId=${parentItem.id}`, { cache: 'no-store' }),
            fetch(`/api/bom/l1-l3?parentId=${parentItem.id}`, { cache: 'no-store' }),
          ])

          const l1l2Data = await safeJson(l1l2Res)
          const l1l3Data = await safeJson(l1l3Res)

          if (!l1l2Res.ok) throw new Error(l1l2Data?.error || 'Failed to load L1 → L2 BOM')
          if (!l1l3Res.ok) throw new Error(l1l3Data?.error || 'Failed to load L1 → L3 BOM')

          setL1ToL2Rows(l1l2Data.map((row: any) => ({ childId: row.l2ItemId, qty: String(row.qty) })))
          setL1ToL3Rows(l1l3Data.map((row: any) => ({ childId: row.l3ItemId, qty: String(row.qty) })))
          setL2ToL3Rows([])
        }

        if (parentItem.itemType === 'L2') {
          const res = await fetch(`/api/bom/l2-l3?parentId=${parentItem.id}`, {
            cache: 'no-store',
          })

          const data = await safeJson(res)

          if (!res.ok) throw new Error(data?.error || 'Failed to load L2 → L3 BOM')

          setL2ToL3Rows(data.map((row: any) => ({ childId: row.l3ItemId, qty: String(row.qty) })))
          setL1ToL2Rows([])
          setL1ToL3Rows([])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    })()
  }, [parentItem?.id, parentItem?.itemType])

  function addRow(setter: React.Dispatch<React.SetStateAction<ChildRow[]>>) {
    setter((prev) => [...prev, { childId: '', qty: '1' }])
  }

  function updateRow(
    rows: ChildRow[],
    setter: React.Dispatch<React.SetStateAction<ChildRow[]>>,
    index: number,
    field: 'childId' | 'qty',
    value: string
  ) {
    const next = [...rows]
    next[index] = { ...next[index], [field]: value }
    setter(next)
  }

  function removeRow(
    rows: ChildRow[],
    setter: React.Dispatch<React.SetStateAction<ChildRow[]>>,
    index: number
  ) {
    const next = [...rows]
    next.splice(index, 1)
    setter(next)
  }

  function validateRows(rows: ChildRow[], label: string) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const hasAnyData = row.childId !== '' || row.qty !== ''

      if (!hasAnyData) continue
      if (!row.childId) return `${label} row ${i + 1}: select a child item`

      if (row.qty === '' || Number(row.qty) <= 0 || Number.isNaN(Number(row.qty))) {
        return `${label} row ${i + 1}: enter a quantity greater than 0`
      }
    }

    return ''
  }

  async function updateParentItemStatus(buildStatus: BuildStatus) {
    if (!parentItem) return

    const payload: any = {
      id: parentItem.id,
      buildStatus,
    }

    if (parentItem.itemType === 'L1') {
      payload.sellingPrice = sellingPriceInput ? Number(sellingPriceInput) : null
    }

    if (parentItem.itemType === 'L2') {
      payload.standardBatchOutput = standardBatchOutputInput
        ? Number(standardBatchOutputInput)
        : null
    }

    const res = await fetch('/api/items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await safeJson(res)

    if (!res.ok) {
      throw new Error(data?.error || 'Failed to update parent item')
    }
  }

  async function saveL1(buildStatus: BuildStatus) {
    if (!parentItem) return

    try {
      setSaving(true)
      setError('')
      setMessage('Saving BOM…')

      if (buildStatus === 'BUILT') {
        if (!sellingPriceInput || Number(sellingPriceInput) <= 0) {
          throw new Error('Enter a selling price before saving L1 as built.')
        }
      }

      const validationError =
        validateRows(l1ToL2Rows, 'L1 → L2') || validateRows(l1ToL3Rows, 'L1 → L3')

      if (validationError) throw new Error(validationError)

      const payloadL1L2 = {
        parentId: parentItem.id,
        rows: l1ToL2Rows
          .filter((row) => row.childId && row.qty !== '')
          .map((row) => ({ childId: row.childId, qty: Number(row.qty) })),
      }

      const payloadL1L3 = {
        parentId: parentItem.id,
        rows: l1ToL3Rows
          .filter((row) => row.childId && row.qty !== '')
          .map((row) => ({ childId: row.childId, qty: Number(row.qty) })),
      }

      const [l1l2Res, l1l3Res] = await Promise.all([
        fetch('/api/bom/l1-l2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadL1L2),
        }),
        fetch('/api/bom/l1-l3', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadL1L3),
        }),
      ])

      const l1l2Data = await safeJson(l1l2Res)
      const l1l3Data = await safeJson(l1l3Res)

      if (!l1l2Res.ok) throw new Error(l1l2Data?.error || 'Failed to save L1 → L2')
      if (!l1l3Res.ok) throw new Error(l1l3Data?.error || 'Failed to save L1 → L3')

      await updateParentItemStatus(buildStatus)
      await Promise.all([loadItems(), loadCosting()])

      setMessage(
        buildStatus === 'BUILT'
          ? `L1 BOM saved as Built.`
          : `L1 BOM saved as Unbuilt. Press Save as Built when final.`
      )
    } catch (err) {
      setMessage('')
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  async function saveL2(buildStatus: BuildStatus) {
    if (!parentItem) return

    try {
      setSaving(true)
      setError('')
      setMessage('Saving BOM…')

      if (buildStatus === 'BUILT') {
        if (!standardBatchOutputInput || Number(standardBatchOutputInput) <= 0) {
          throw new Error('Enter a standard batch output before saving L2 as built.')
        }
      }

      const validationError = validateRows(l2ToL3Rows, 'L2 → L3')
      if (validationError) throw new Error(validationError)

      const payload = {
        parentId: parentItem.id,
        rows: l2ToL3Rows
          .filter((row) => row.childId && row.qty !== '')
          .map((row) => ({ childId: row.childId, qty: Number(row.qty) })),
      }

      const res = await fetch('/api/bom/l2-l3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await safeJson(res)

      if (!res.ok) throw new Error(data?.error || 'Failed to save L2 → L3')

      await updateParentItemStatus(buildStatus)
      await Promise.all([loadItems(), loadCosting()])

      setMessage(
        buildStatus === 'BUILT'
          ? `L2 BOM saved as Built.`
          : `L2 BOM saved as Unbuilt. Press Save as Built when final.`
      )
    } catch (err) {
      setMessage('')
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">BOM Builder</h1>
            <p className="mt-2 text-slate-800">
              Build L1 dishes and L2 prep batches. Save as Built only when the build is final.
            </p>
          </div>

          {costingLoading ? (
            <div className="rounded-xl border bg-white px-4 py-2 text-sm text-slate-600">
              Loading costing…
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mt-4 whitespace-pre-wrap rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="mt-4 whitespace-pre-wrap rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
            {message}
          </div>
        ) : null}

        <div className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <label className="mb-2 block text-sm font-medium text-slate-900">Parent Item</label>
          <select
            value={parentId}
            onChange={(e) => {
              setParentId(e.target.value)
              setMessage('')
              setError('')
              const nextUrl = e.target.value ? `/bom?itemId=${e.target.value}` : '/bom'
              window.history.replaceState(null, '', nextUrl)
            }}
            className="w-full rounded-xl border px-3 py-2"
          >
            <option value="">Select parent item</option>
            {[...l1Items, ...l2Items].map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} [{item.sku}] ({item.itemType}) - {item.buildStatus === 'BUILT' ? 'Built' : 'Unbuilt'}
              </option>
            ))}
          </select>

          {parentItem ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
              <div className="font-medium text-slate-900">
                {parentItem.name} [{parentItem.sku}]
              </div>
              {buildStatusBadge(parentItem)}
            </div>
          ) : null}
        </div>

        {loading ? <div className="mt-6 text-sm text-slate-700">Loading BOM…</div> : null}

        {parentItem?.itemType === 'L1' ? (
          <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">L1 Dish Settings</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-900">
                  Selling Price
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={sellingPriceInput}
                  onChange={(e) => setSellingPriceInput(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2"
                  placeholder="Decide after costing"
                />
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Total COGS</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {money(l1LiveCosting?.totalCogs)}
                </div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Food Cost %</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {percent(l1LiveCosting?.foodCostPercent)}
                </div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Gross Margin</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {percent(l1LiveCosting?.grossMargin)}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {parentItem?.itemType === 'L2' ? (
          <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">L2 Batch Settings</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-900">
                  Standard Batch Output ({parentItem.unitType})
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={standardBatchOutputInput}
                  onChange={(e) => setStandardBatchOutputInput(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2"
                  placeholder="Output from this batch"
                />
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Total Batch Cost</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {money(l2LiveCosting?.totalBatchCost)}
                </div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Cost Per {parentItem.unitType}</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {l2LiveCosting?.costPerUnit === null || l2LiveCosting?.costPerUnit === undefined
                    ? '—'
                    : `${money(l2LiveCosting.costPerUnit, 5)} / ${parentItem.unitType}`}
                </div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Warnings</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {l2LiveCosting?.missingCostCount === 0
                    ? 'Complete'
                    : `${l2LiveCosting?.missingCostCount ?? 0} missing`}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {parentItem?.itemType === 'L1' ? (
          <div className="mt-8 space-y-8">
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">L1 → L2</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Enter how much L2 prep is used per dish.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => addRow(setL1ToL2Rows)}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-white"
                >
                  Add L2 Row
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {l1ToL2Rows.map((row, index) => {
                  const item = getItem(row.childId)
                  const cost = getL2Cost(row.childId)
                  const rowQty = getQty(row.qty)
                  const lineCost =
                    cost?.costPerUnit !== null && cost?.costPerUnit !== undefined
                      ? rowQty * cost.costPerUnit
                      : null

                  return (
                    <div key={index} className="grid gap-3 md:grid-cols-[1fr_220px_150px_150px_100px]">
                      <L2Picker
                        selectedId={row.childId}
                        l2Items={l2Items}
                        onSelect={(id) => updateRow(l1ToL2Rows, setL1ToL2Rows, index, 'childId', id)}
                      />

                      <QtyInput
                        value={row.qty}
                        unit={getUnit(row.childId)}
                        placeholder="Qty per dish"
                        onChange={(value) => updateRow(l1ToL2Rows, setL1ToL2Rows, index, 'qty', value)}
                      />

                      <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-800">
                        {cost?.costPerUnit !== null && cost?.costPerUnit !== undefined && item
                          ? `${money(cost.costPerUnit, 5)} / ${item.unitType}`
                          : 'Missing cost'}
                      </div>

                      <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900">
                        {money(lineCost)}
                      </div>

                      <button
                        type="button"
                        onClick={() => removeRow(l1ToL2Rows, setL1ToL2Rows, index)}
                        className="rounded-xl border px-3 py-2"
                      >
                        Remove
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">L1 → L3</h2>
                  <p className="mt-1 text-sm text-slate-600">Enter direct ingredients per dish.</p>
                </div>

                <button
                  type="button"
                  onClick={() => addRow(setL1ToL3Rows)}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-white"
                >
                  Add L3 Row
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {l1ToL3Rows.map((row, index) => {
                  const item = getItem(row.childId)
                  const price = getL3Price(row.childId)
                  const rowQty = getQty(row.qty)
                  const lineCost = price ? rowQty * price.unitPrice : null

                  return (
                    <div key={index} className="grid gap-3 md:grid-cols-[1fr_220px_150px_150px_100px]">
                      <L3SearchPicker
                        selectedId={row.childId}
                        l3Items={l3Items}
                        onError={setError}
                        onSelect={(id) => updateRow(l1ToL3Rows, setL1ToL3Rows, index, 'childId', id)}
                      />

                      <QtyInput
                        value={row.qty}
                        unit={getUnit(row.childId)}
                        placeholder="Qty per dish"
                        onChange={(value) => updateRow(l1ToL3Rows, setL1ToL3Rows, index, 'qty', value)}
                      />

                      <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-800">
                        {price && item ? `${money(price.unitPrice, 5)} / ${item.unitType}` : 'Missing price'}
                      </div>

                      <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900">
                        {money(lineCost)}
                      </div>

                      <button
                        type="button"
                        onClick={() => removeRow(l1ToL3Rows, setL1ToL3Rows, index)}
                        className="rounded-xl border px-3 py-2"
                      >
                        Remove
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => saveL1('UNBUILT')}
                className="rounded-xl border border-slate-400 bg-white px-5 py-3 text-slate-900 hover:bg-slate-50 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={() => saveL1('BUILT')}
                className="rounded-xl bg-green-700 px-5 py-3 text-white hover:bg-green-800 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save as Built'}
              </button>
            </div>
          </div>
        ) : null}

        {parentItem?.itemType === 'L2' ? (
          <div className="mt-8 space-y-8">
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">L2 → L3</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Enter ingredients used to make one standard batch.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => addRow(setL2ToL3Rows)}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-white"
                >
                  Add L3 Row
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {l2ToL3Rows.map((row, index) => {
                  const item = getItem(row.childId)
                  const price = getL3Price(row.childId)
                  const rowQty = getQty(row.qty)
                  const lineCost = price ? rowQty * price.unitPrice : null

                  return (
                    <div key={index} className="grid gap-3 md:grid-cols-[1fr_220px_150px_150px_100px]">
                      <L3SearchPicker
                        selectedId={row.childId}
                        l3Items={l3Items}
                        onError={setError}
                        onSelect={(id) => updateRow(l2ToL3Rows, setL2ToL3Rows, index, 'childId', id)}
                      />

                      <QtyInput
                        value={row.qty}
                        unit={getUnit(row.childId)}
                        placeholder="Qty per batch"
                        onChange={(value) => updateRow(l2ToL3Rows, setL2ToL3Rows, index, 'qty', value)}
                      />

                      <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-800">
                        {price && item ? `${money(price.unitPrice, 5)} / ${item.unitType}` : 'Missing price'}
                      </div>

                      <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900">
                        {money(lineCost)}
                      </div>

                      <button
                        type="button"
                        onClick={() => removeRow(l2ToL3Rows, setL2ToL3Rows, index)}
                        className="rounded-xl border px-3 py-2"
                      >
                        Remove
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => saveL2('UNBUILT')}
                className="rounded-xl border border-slate-400 bg-white px-5 py-3 text-slate-900 hover:bg-slate-50 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={() => saveL2('BUILT')}
                className="rounded-xl bg-green-700 px-5 py-3 text-white hover:bg-green-800 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save as Built'}
              </button>
            </div>
          </div>
        ) : null}

        {!parentItem ? (
          <div className="mt-8 rounded-2xl border bg-white p-6 text-sm text-slate-700 shadow-sm">
            Select an L1 or L2 parent item to start building.
          </div>
        ) : null}

        <div className="mt-8 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">
          Plain <strong>Save</strong> stores the BOM but leaves the item marked <strong>Unbuilt</strong>.
          <strong> Save as Built</strong> stores the BOM and turns the item green in the Items list.
        </div>
      </div>
    </main>
  )
}