'use client'

import { useEffect, useMemo, useState } from 'react'
import CopyableError from '@/app/components/CopyableError'

type ItemType = 'L0' | 'L1' | 'L2' | 'L3'
type UnitType = 'g' | 'ml' | 'each'
type BuildStatus = 'UNBUILT' | 'BUILT'
type PrepTimeStatus = 'MISSING' | 'ESTIMATED' | 'CONFIRMED' | 'STALE'

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
  itemType: ItemType
  unitType: UnitType
  sellingPrice?: number | null
  standardBatchOutput?: number | null
  buildStatus?: BuildStatus
  prepSetupMinutes?: number | null
  prepActiveMinutes?: number | null
  prepCleanupMinutes?: number | null
  prepPassiveMinutes?: number | null
  prepHandsOnMinutes?: number | null
  prepElapsedMinutes?: number | null
  prepTimeConfidence?: number | null
  prepTimeAssumptions?: string[] | null
  prepTimeStatus?: PrepTimeStatus
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

type L1CostingRow = {
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
}

type ExpandedL1Bom = {
  loading: boolean
  error: string
  l1ToL2Rows: Array<{
    id: string
    l1ItemId: string
    l2ItemId: string
    qty: number
    l2: Item
  }>
  l1ToL3Rows: Array<{
    id: string
    l1ItemId: string
    l3ItemId: string
    qty: number
    l3: Item
  }>
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

function L1Picker({
  selectedId,
  l1Items,
  onSelect,
}: {
  selectedId: string
  l1Items: Item[]
  onSelect: (id: string) => void
}) {
  return (
    <select
      value={selectedId}
      onChange={(e) => onSelect(e.target.value)}
      className="rounded-xl border px-3 py-2"
    >
      <option value="">Select L1 dish</option>
      {l1Items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name} [{item.sku}]
        </option>
      ))}
    </select>
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
    if (!selectedId) setQuery('')
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

  function unitPriceLabel(item: Item) {
    const best = item.bestSupplierPrice

    if (!best || best.unitPrice === null || best.unitPrice === undefined) {
      return 'No supplier price'
    }

    return `${money(best.unitPrice, 5)} / ${item.unitType}`
  }

  function supplierPriceDetails(item: Item) {
    const best = item.bestSupplierPrice

    if (!best) return 'No linked supplier price found'

    const packParts = [best.packSize, best.weight].filter(Boolean).join(' / ')

    return [
      best.supplier,
      best.supplierSku ? `SKU ${best.supplierSku}` : null,
      packParts ? `Pack ${packParts}` : null,
      best.packPrice !== null && best.packPrice !== undefined
        ? `Pack price ${money(best.packPrice, 2)}`
        : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  function selectSupplierProduct(product: SupplierProduct) {
    const matchedItem =
      product.linkedItem ||
      (product.linkedItemId
        ? l3Items.find((item) => item.id === product.linkedItemId)
        : null) ||
      l3Items.find((item) => product.supplierSku && item.sku === product.supplierSku) ||
      l3Items.find((item) => item.name.toLowerCase().includes(product.name.toLowerCase())) ||
      l3Items.find((item) => product.name.toLowerCase().includes(item.name.toLowerCase()))

    if (!matchedItem) {
      onError(
        `Supplier product "${product.name}" is not linked to an L3 item yet. Save/import supplier products first so L3s are created.`
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
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">
                    {item.name} [{item.sku}]
                  </div>
                  <div className="text-xs text-slate-600">
                    Unit: {item.unitType} · {supplierPriceDetails(item)}
                  </div>
                </div>

                <div
                  className={`shrink-0 rounded-lg px-2 py-1 text-xs font-semibold ${
                    item.bestSupplierPrice?.unitPrice
                      ? 'bg-green-50 text-green-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {unitPriceLabel(item)}
                </div>
              </div>
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
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{product.name}</div>
                  <div className="text-xs text-slate-700">
                    {product.supplier} · SKU {product.supplierSku || 'N/A'} · Pack{' '}
                    {product.packSize || 'N/A'} · Weight {product.weight || 'N/A'} · Pack Price{' '}
                    {money(product.packPrice, 2)}
                    {product.linkedItem ? (
                      <> · Linked to {product.linkedItem.name} [{product.linkedItem.sku}]</>
                    ) : null}
                  </div>
                </div>

                <div className="shrink-0 rounded-lg bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">
                  {product.unitPrice
                    ? `${money(product.unitPrice, 5)} / supplier unit`
                    : 'No unit price'}
                </div>
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
  const [l1CostingRows, setL1CostingRows] = useState<L1CostingRow[]>([])

  const [parentId, setParentId] = useState('')
  const [loading, setLoading] = useState(false)
  const [costingLoading, setCostingLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [parentSellingPrice, setParentSellingPrice] = useState('')
  const [parentStandardBatchOutput, setParentStandardBatchOutput] = useState('')
  const [prepSetupMinutes, setPrepSetupMinutes] = useState('')
  const [prepActiveMinutes, setPrepActiveMinutes] = useState('')
  const [prepCleanupMinutes, setPrepCleanupMinutes] = useState('')
  const [prepPassiveMinutes, setPrepPassiveMinutes] = useState('')
  const [prepTimeAssumptions, setPrepTimeAssumptions] = useState('')
  const [calculatingPrepTime, setCalculatingPrepTime] = useState(false)
  const [confirmingPrepTime, setConfirmingPrepTime] = useState(false)
  const [savedBomSignature, setSavedBomSignature] = useState('')

  const [l0ToL1Rows, setL0ToL1Rows] = useState<ChildRow[]>([])
  const [l1ToL2Rows, setL1ToL2Rows] = useState<ChildRow[]>([])
  const [l1ToL3Rows, setL1ToL3Rows] = useState<ChildRow[]>([])
  const [l2ToL2Rows, setL2ToL2Rows] = useState<ChildRow[]>([])
  const [l2ToL3Rows, setL2ToL3Rows] = useState<ChildRow[]>([])

  const [expandedL1Ids, setExpandedL1Ids] = useState<string[]>([])
  const [expandedL1BomById, setExpandedL1BomById] = useState<Record<string, ExpandedL1Bom>>({})

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

  function normaliseRows(rows: ChildRow[]) {
    return rows.map((row) => ({
      childId: row.childId,
      qty: row.qty,
    }))
  }

  function bomSignature(input: {
    parentId: string
    itemType: ItemType | ''
    parentSellingPrice: string
    parentStandardBatchOutput: string
    prepSetupMinutes: string
    prepActiveMinutes: string
    prepCleanupMinutes: string
    prepPassiveMinutes: string
    prepTimeAssumptions: string
    l0ToL1Rows: ChildRow[]
    l1ToL2Rows: ChildRow[]
    l1ToL3Rows: ChildRow[]
    l2ToL2Rows: ChildRow[]
    l2ToL3Rows: ChildRow[]
  }) {
    return JSON.stringify({
      parentId: input.parentId,
      itemType: input.itemType,
      parentSellingPrice: input.parentSellingPrice,
      parentStandardBatchOutput: input.parentStandardBatchOutput,
      prepSetupMinutes: input.prepSetupMinutes,
      prepActiveMinutes: input.prepActiveMinutes,
      prepCleanupMinutes: input.prepCleanupMinutes,
      prepPassiveMinutes: input.prepPassiveMinutes,
      prepTimeAssumptions: input.prepTimeAssumptions,
      l0ToL1Rows: normaliseRows(input.l0ToL1Rows),
      l1ToL2Rows: normaliseRows(input.l1ToL2Rows),
      l1ToL3Rows: normaliseRows(input.l1ToL3Rows),
      l2ToL2Rows: normaliseRows(input.l2ToL2Rows),
      l2ToL3Rows: normaliseRows(input.l2ToL3Rows),
    })
  }

  function parentValuesForSignature(item: Item | null) {
    return {
      parentSellingPrice:
        item?.sellingPrice === null || item?.sellingPrice === undefined
          ? ''
          : String(item.sellingPrice),
      parentStandardBatchOutput:
        item?.standardBatchOutput === null || item?.standardBatchOutput === undefined
          ? ''
          : String(item.standardBatchOutput),
      prepSetupMinutes:
        item?.prepSetupMinutes === null || item?.prepSetupMinutes === undefined
          ? ''
          : String(item.prepSetupMinutes),
      prepActiveMinutes:
        item?.prepActiveMinutes === null || item?.prepActiveMinutes === undefined
          ? ''
          : String(item.prepActiveMinutes),
      prepCleanupMinutes:
        item?.prepCleanupMinutes === null || item?.prepCleanupMinutes === undefined
          ? ''
          : String(item.prepCleanupMinutes),
      prepPassiveMinutes:
        item?.prepPassiveMinutes === null || item?.prepPassiveMinutes === undefined
          ? ''
          : String(item.prepPassiveMinutes),
      prepTimeAssumptions:
        Array.isArray(item?.prepTimeAssumptions) ? item.prepTimeAssumptions.join('\n') : '',
    }
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

      const [bomCostingRes, l1CostingRes] = await Promise.all([
        fetch('/api/bom-costing', { cache: 'no-store' }),
        fetch('/api/costing/l1', { cache: 'no-store' }),
      ])

      const bomCostingData = await safeJson(bomCostingRes)
      const l1CostingData = await safeJson(l1CostingRes)

      if (!bomCostingRes.ok) throw new Error(bomCostingData?.error || 'Failed to load BOM costing')
      if (!l1CostingRes.ok) throw new Error(l1CostingData?.error || 'Failed to load L1 costing')

      setCostingData(bomCostingData)
      setL1CostingRows(l1CostingData)
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
    if (parentId) return

    const params = new URLSearchParams(window.location.search)
    const parentIdFromUrl = params.get('parentId')

    if (parentIdFromUrl) {
      setParentId(parentIdFromUrl)
    }
  }, [parentId])

  const parentItem = useMemo(
    () => items.find((item) => item.id === parentId) ?? null,
    [items, parentId]
  )

  const l0Items = items.filter((item) => item.itemType === 'L0')
  const l1Items = items.filter((item) => item.itemType === 'L1')
  const l2Items = items.filter((item) => item.itemType === 'L2')
  const l3Items = items.filter((item) => item.itemType === 'L3')

  const l2ChildOptions = useMemo(() => {
    if (!parentItem || parentItem.itemType !== 'L2') return l2Items
    return l2Items.filter((item) => item.id !== parentItem.id)
  }, [l2Items, parentItem])

  const l1CostingByItemId = useMemo(() => {
    return new Map(l1CostingRows.map((row) => [row.itemId, row]))
  }, [l1CostingRows])

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

  useEffect(() => {
    if (!parentItem) {
      setParentSellingPrice('')
      setParentStandardBatchOutput('')
      return
    }

    setParentSellingPrice(
      parentItem.sellingPrice === null || parentItem.sellingPrice === undefined
        ? ''
        : String(parentItem.sellingPrice)
    )

    setParentStandardBatchOutput(
      parentItem.standardBatchOutput === null || parentItem.standardBatchOutput === undefined
        ? ''
        : String(parentItem.standardBatchOutput)
    )
  }, [parentItem?.id])

  useEffect(() => {
    if (!parentItem || parentItem.itemType !== 'L2') {
      setPrepSetupMinutes('')
      setPrepActiveMinutes('')
      setPrepCleanupMinutes('')
      setPrepPassiveMinutes('')
      setPrepTimeAssumptions('')
      return
    }

    setPrepSetupMinutes(
      parentItem.prepSetupMinutes === null || parentItem.prepSetupMinutes === undefined
        ? ''
        : String(parentItem.prepSetupMinutes)
    )
    setPrepActiveMinutes(
      parentItem.prepActiveMinutes === null || parentItem.prepActiveMinutes === undefined
        ? ''
        : String(parentItem.prepActiveMinutes)
    )
    setPrepCleanupMinutes(
      parentItem.prepCleanupMinutes === null || parentItem.prepCleanupMinutes === undefined
        ? ''
        : String(parentItem.prepCleanupMinutes)
    )
    setPrepPassiveMinutes(
      parentItem.prepPassiveMinutes === null || parentItem.prepPassiveMinutes === undefined
        ? ''
        : String(parentItem.prepPassiveMinutes)
    )
    setPrepTimeAssumptions(
      Array.isArray(parentItem.prepTimeAssumptions)
        ? parentItem.prepTimeAssumptions.join('\n')
        : ''
    )
  }, [
    parentItem?.id,
    parentItem?.prepSetupMinutes,
    parentItem?.prepActiveMinutes,
    parentItem?.prepCleanupMinutes,
    parentItem?.prepPassiveMinutes,
    parentItem?.prepTimeAssumptions,
  ])

  const l0LiveCosting = useMemo(() => {
    if (!parentItem || parentItem.itemType !== 'L0') {
      return null
    }

    let totalMenuCogs = 0
    let totalMenuSales = 0
    let missingCostCount = 0

    const rows = l0ToL1Rows.map((row) => {
      const item = getItem(row.childId)
      const qty = getQty(row.qty)
      const cost = row.childId ? l1CostingByItemId.get(row.childId) ?? null : null

      const lineCogs = cost ? qty * cost.foodCost : null
      const lineSales =
        cost?.sellingPrice !== null && cost?.sellingPrice !== undefined
          ? qty * cost.sellingPrice
          : null

      if (row.childId && !cost) {
        missingCostCount++
      }

      if (cost?.missingCostCount) {
        missingCostCount += cost.missingCostCount
      }

      if (lineCogs !== null) totalMenuCogs += lineCogs
      if (lineSales !== null) totalMenuSales += lineSales

      return {
        row,
        item,
        qty,
        cost,
        lineCogs,
        lineSales,
      }
    })

    const grossProfit = totalMenuSales > 0 ? totalMenuSales - totalMenuCogs : null
    const grossMargin =
      totalMenuSales > 0 && grossProfit !== null ? (grossProfit / totalMenuSales) * 100 : null
    const foodCostPercent = totalMenuSales > 0 ? (totalMenuCogs / totalMenuSales) * 100 : null

    return {
      rows,
      totalMenuCogs,
      totalMenuSales,
      grossProfit,
      grossMargin,
      foodCostPercent,
      missingCostCount,
    }
  }, [parentItem, l0ToL1Rows, l1CostingByItemId, items])

  const l2LiveCosting = useMemo(() => {
    if (!parentItem || parentItem.itemType !== 'L2') {
      return null
    }

    let totalBatchCost = 0
    let missingCostCount = 0

    const prepRows = l2ToL2Rows.map((row) => {
      const item = getItem(row.childId)
      const qty = getQty(row.qty)
      const cost = row.childId ? getL2Cost(row.childId) : null

      const lineCost =
        cost?.costPerUnit !== null && cost?.costPerUnit !== undefined
          ? qty * cost.costPerUnit
          : null

      if (row.childId && (!cost || cost.costPerUnit === null)) {
        missingCostCount++
      }

      if (cost?.missingCostCount) {
        missingCostCount += cost.missingCostCount
      }

      if (lineCost !== null) {
        totalBatchCost += lineCost
      }

      return {
        row,
        item,
        qty,
        cost,
        lineCost,
      }
    })

    const ingredientRows = l2ToL3Rows.map((row) => {
      const item = getItem(row.childId)
      const qty = getQty(row.qty)
      const price = row.childId ? getL3Price(row.childId) : null
      const lineCost = price ? qty * price.unitPrice : null

      if (row.childId && !price) {
        missingCostCount++
      }

      if (lineCost !== null) {
        totalBatchCost += lineCost
      }

      return {
        row,
        item,
        qty,
        price,
        lineCost,
      }
    })

    const standardBatchOutput = parentStandardBatchOutput
      ? Number(parentStandardBatchOutput)
      : null

    const costPerUnit =
      standardBatchOutput && standardBatchOutput > 0
        ? totalBatchCost / standardBatchOutput
        : null

    if (!standardBatchOutput || standardBatchOutput <= 0) {
      missingCostCount++
    }

    return {
      prepRows,
      ingredientRows,
      totalBatchCost,
      standardBatchOutput,
      costPerUnit,
      missingCostCount,
    }
  }, [parentItem, l2ToL2Rows, l2ToL3Rows, costingData, items, parentStandardBatchOutput])

  const l1LiveCosting = useMemo(() => {
    if (!parentItem || parentItem.itemType !== 'L1') {
      return null
    }

    let totalCogs = 0
    let missingCostCount = 0

    const directRows = l1ToL3Rows.map((row) => {
      const item = getItem(row.childId)
      const qty = getQty(row.qty)
      const price = row.childId ? getL3Price(row.childId) : null
      const lineCost = price ? qty * price.unitPrice : null

      if (row.childId && !price) {
        missingCostCount++
      }

      if (lineCost !== null) {
        totalCogs += lineCost
      }

      return {
        row,
        item,
        qty,
        price,
        lineCost,
      }
    })

    const prepRows = l1ToL2Rows.map((row) => {
      const item = getItem(row.childId)
      const qty = getQty(row.qty)
      const cost = row.childId ? getL2Cost(row.childId) : null
      const lineCost =
        cost?.costPerUnit !== null && cost?.costPerUnit !== undefined
          ? qty * cost.costPerUnit
          : null

      if (row.childId && (!cost || cost.costPerUnit === null)) {
        missingCostCount++
      }

      if (cost?.missingCostCount) {
        missingCostCount += cost.missingCostCount
      }

      if (lineCost !== null) {
        totalCogs += lineCost
      }

      return {
        row,
        item,
        qty,
        cost,
        lineCost,
      }
    })

    const sellingPrice = parentSellingPrice ? Number(parentSellingPrice) : null

    const grossProfit =
      sellingPrice !== null && sellingPrice > 0 ? sellingPrice - totalCogs : null

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
  }, [parentItem, l1ToL2Rows, l1ToL3Rows, costingData, items, parentSellingPrice])

  const currentBomSignature = useMemo(
    () =>
      bomSignature({
        parentId,
        itemType: parentItem?.itemType ?? '',
        parentSellingPrice,
        parentStandardBatchOutput,
        prepSetupMinutes,
        prepActiveMinutes,
        prepCleanupMinutes,
        prepPassiveMinutes,
        prepTimeAssumptions,
        l0ToL1Rows,
        l1ToL2Rows,
        l1ToL3Rows,
        l2ToL2Rows,
        l2ToL3Rows,
      }),
    [
      parentId,
      parentItem?.itemType,
      parentSellingPrice,
      parentStandardBatchOutput,
      prepSetupMinutes,
      prepActiveMinutes,
      prepCleanupMinutes,
      prepPassiveMinutes,
      prepTimeAssumptions,
      l0ToL1Rows,
      l1ToL2Rows,
      l1ToL3Rows,
      l2ToL2Rows,
      l2ToL3Rows,
    ]
  )
  const hasUnsavedBomChanges =
    Boolean(parentItem) && Boolean(savedBomSignature) && currentBomSignature !== savedBomSignature
  const unsavedBomMessage =
    'You have unsaved BOM changes. Save the BOM before leaving or changing parent item.'

  useEffect(() => {
    if (!parentItem) {
      setL0ToL1Rows([])
      setL1ToL2Rows([])
      setL1ToL3Rows([])
      setL2ToL2Rows([])
      setL2ToL3Rows([])
      setSavedBomSignature('')
      return
    }

    ;(async () => {
      try {
        setError('')
        setMessage('')
        setLoading(true)

        if (parentItem.itemType === 'L0') {
          const res = await fetch(`/api/bom/l0-l1?parentId=${parentItem.id}`, {
            cache: 'no-store',
          })

          const data = await safeJson(res)

          if (!res.ok) throw new Error(data?.error || 'Failed to load L0 → L1 BOM')

          const nextL0ToL1Rows = data.map((row: any) => ({
            childId: row.l1ItemId,
            qty: String(row.qty),
          }))

          setL0ToL1Rows(nextL0ToL1Rows)
          setL1ToL2Rows([])
          setL1ToL3Rows([])
          setL2ToL2Rows([])
          setL2ToL3Rows([])
          setSavedBomSignature(
            bomSignature({
              parentId: parentItem.id,
              itemType: parentItem.itemType,
              ...parentValuesForSignature(parentItem),
              l0ToL1Rows: nextL0ToL1Rows,
              l1ToL2Rows: [],
              l1ToL3Rows: [],
              l2ToL2Rows: [],
              l2ToL3Rows: [],
            })
          )
        }

        if (parentItem.itemType === 'L1') {
          const [l1l2Res, l1l3Res] = await Promise.all([
            fetch(`/api/bom/l1-l2?parentId=${parentItem.id}`, { cache: 'no-store' }),
            fetch(`/api/bom/l1-l3?parentId=${parentItem.id}`, { cache: 'no-store' }),
          ])

          const l1l2Data = await safeJson(l1l2Res)
          const l1l3Data = await safeJson(l1l3Res)

          if (!l1l2Res.ok) throw new Error(l1l2Data?.error || 'Failed to load L1 → L2 BOM')
          if (!l1l3Res.ok) throw new Error(l1l3Data?.error || 'Failed to load L1 → L3 BOM')

          const nextL1ToL2Rows = l1l2Data.map((row: any) => ({
            childId: row.l2ItemId,
            qty: String(row.qty),
          }))

          const nextL1ToL3Rows = l1l3Data.map((row: any) => ({
            childId: row.l3ItemId,
            qty: String(row.qty),
          }))

          setL1ToL2Rows(nextL1ToL2Rows)
          setL1ToL3Rows(nextL1ToL3Rows)
          setL0ToL1Rows([])
          setL2ToL2Rows([])
          setL2ToL3Rows([])
          setSavedBomSignature(
            bomSignature({
              parentId: parentItem.id,
              itemType: parentItem.itemType,
              ...parentValuesForSignature(parentItem),
              l0ToL1Rows: [],
              l1ToL2Rows: nextL1ToL2Rows,
              l1ToL3Rows: nextL1ToL3Rows,
              l2ToL2Rows: [],
              l2ToL3Rows: [],
            })
          )
        }

        if (parentItem.itemType === 'L2') {
          const [l2l2Res, l2l3Res] = await Promise.all([
            fetch(`/api/bom/l2-l2?parentId=${parentItem.id}`, { cache: 'no-store' }),
            fetch(`/api/bom/l2-l3?parentId=${parentItem.id}`, { cache: 'no-store' }),
          ])

          const l2l2Data = await safeJson(l2l2Res)
          const l2l3Data = await safeJson(l2l3Res)

          if (!l2l2Res.ok) throw new Error(l2l2Data?.error || 'Failed to load L2 → L2 BOM')
          if (!l2l3Res.ok) throw new Error(l2l3Data?.error || 'Failed to load L2 → L3 BOM')

          const nextL2ToL2Rows = l2l2Data.map((row: any) => ({
            childId: row.childL2ItemId,
            qty: String(row.qty),
          }))

          const nextL2ToL3Rows = l2l3Data.map((row: any) => ({
            childId: row.l3ItemId,
            qty: String(row.qty),
          }))

          setL2ToL2Rows(nextL2ToL2Rows)
          setL2ToL3Rows(nextL2ToL3Rows)
          setL0ToL1Rows([])
          setL1ToL2Rows([])
          setL1ToL3Rows([])
          setSavedBomSignature(
            bomSignature({
              parentId: parentItem.id,
              itemType: parentItem.itemType,
              ...parentValuesForSignature(parentItem),
              l0ToL1Rows: [],
              l1ToL2Rows: [],
              l1ToL3Rows: [],
              l2ToL2Rows: nextL2ToL2Rows,
              l2ToL3Rows: nextL2ToL3Rows,
            })
          )
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    })()
  }, [parentItem?.id, parentItem?.itemType])

  useEffect(() => {
    if (!hasUnsavedBomChanges) return

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedBomChanges, unsavedBomMessage])

  useEffect(() => {
    if (!hasUnsavedBomChanges) return

    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null

      if (!anchor || anchor.target || anchor.hasAttribute('download')) return

      const url = new URL(anchor.href, window.location.href)

      if (url.origin !== window.location.origin) return
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        url.hash
      ) {
        return
      }

      if (!window.confirm(unsavedBomMessage)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    document.addEventListener('click', handleDocumentClick, true)
    return () => document.removeEventListener('click', handleDocumentClick, true)
  }, [hasUnsavedBomChanges, unsavedBomMessage])

  function confirmDiscardBomChanges() {
    return !hasUnsavedBomChanges || window.confirm(unsavedBomMessage)
  }

  function handleParentChange(nextParentId: string) {
    if (nextParentId === parentId) return
    if (!confirmDiscardBomChanges()) return

    setSavedBomSignature('')
    setParentId(nextParentId)
    setExpandedL1Ids([])
    setExpandedL1BomById({})
    setMessage('')
    setError('')
  }

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

  function isL1Expanded(l1ItemId: string) {
    return expandedL1Ids.includes(l1ItemId)
  }

  async function toggleL1Expanded(l1ItemId: string) {
    const alreadyExpanded = expandedL1Ids.includes(l1ItemId)

    if (alreadyExpanded) {
      setExpandedL1Ids((prev) => prev.filter((id) => id !== l1ItemId))
      return
    }

    setExpandedL1Ids((prev) => [...prev, l1ItemId])

    if (expandedL1BomById[l1ItemId]) {
      return
    }

    setExpandedL1BomById((prev) => ({
      ...prev,
      [l1ItemId]: {
        loading: true,
        error: '',
        l1ToL2Rows: [],
        l1ToL3Rows: [],
      },
    }))

    try {
      const [l1l2Res, l1l3Res] = await Promise.all([
        fetch(`/api/bom/l1-l2?parentId=${l1ItemId}`, { cache: 'no-store' }),
        fetch(`/api/bom/l1-l3?parentId=${l1ItemId}`, { cache: 'no-store' }),
      ])

      const l1l2Data = await safeJson(l1l2Res)
      const l1l3Data = await safeJson(l1l3Res)

      if (!l1l2Res.ok) {
        throw new Error(l1l2Data?.error || 'Failed to load L1 → L2 rows')
      }

      if (!l1l3Res.ok) {
        throw new Error(l1l3Data?.error || 'Failed to load L1 → L3 rows')
      }

      setExpandedL1BomById((prev) => ({
        ...prev,
        [l1ItemId]: {
          loading: false,
          error: '',
          l1ToL2Rows: l1l2Data,
          l1ToL3Rows: l1l3Data,
        },
      }))
    } catch (err) {
      setExpandedL1BomById((prev) => ({
        ...prev,
        [l1ItemId]: {
          loading: false,
          error: err instanceof Error ? err.message : 'Unknown error',
          l1ToL2Rows: [],
          l1ToL3Rows: [],
        },
      }))
    }
  }

  function expandedL1Costing(l1ItemId: string) {
    return l1CostingByItemId.get(l1ItemId) ?? null
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

  async function patchParentItem(buildStatus?: BuildStatus) {
    if (!parentItem) return

    const payload: any = {
      id: parentItem.id,
    }

    if (parentItem.itemType === 'L1') {
      payload.sellingPrice = parentSellingPrice ? Number(parentSellingPrice) : null
    }

    if (parentItem.itemType === 'L2') {
      payload.standardBatchOutput = parentStandardBatchOutput
        ? Number(parentStandardBatchOutput)
        : null
    }

    if (buildStatus) {
      payload.buildStatus = buildStatus
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

  async function saveL0(buildStatus?: BuildStatus) {
    if (!parentItem) return

    try {
      setError('')
      setMessage('Saving L0 menu BOM…')

      const validationError = validateRows(l0ToL1Rows, 'L0 → L1')

      if (validationError) {
        setMessage('')
        setError(validationError)
        return
      }

      const payload = {
        parentId: parentItem.id,
        rows: l0ToL1Rows
          .filter((row) => row.childId && row.qty !== '')
          .map((row) => ({
            childId: row.childId,
            qty: Number(row.qty),
          })),
      }

      const res = await fetch('/api/bom/l0-l1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await safeJson(res)

      if (!res.ok) throw new Error(data?.error || 'Failed to save L0 → L1')

      if (buildStatus) {
        await patchParentItem(buildStatus)
      }

      await Promise.all([loadItems(), loadCosting()])
      setSavedBomSignature(currentBomSignature)

      setMessage(
        buildStatus === 'BUILT'
          ? `L0 menu saved as built. Showing ${payload.rows.length} L1 row(s).`
          : `L0 menu BOM saved. Showing ${payload.rows.length} L1 row(s).`
      )
    } catch (err) {
      setMessage('')
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  async function saveL1(buildStatus?: BuildStatus) {
    if (!parentItem) return

    try {
      setError('')
      setMessage('Saving L1 BOM…')

      const validationError =
        validateRows(l1ToL2Rows, 'L1 → L2') || validateRows(l1ToL3Rows, 'L1 → L3')

      if (validationError) {
        setMessage('')
        setError(validationError)
        return
      }

      await patchParentItem(buildStatus)

      const payloadL1L2 = {
        parentId: parentItem.id,
        rows: l1ToL2Rows
          .filter((row) => row.childId && row.qty !== '')
          .map((row) => ({
            childId: row.childId,
            qty: Number(row.qty),
          })),
      }

      const payloadL1L3 = {
        parentId: parentItem.id,
        rows: l1ToL3Rows
          .filter((row) => row.childId && row.qty !== '')
          .map((row) => ({
            childId: row.childId,
            qty: Number(row.qty),
          })),
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

      await Promise.all([loadItems(), loadCosting()])
      setSavedBomSignature(currentBomSignature)

      setMessage(
        buildStatus === 'BUILT'
          ? `L1 BOM saved as built. Showing ${payloadL1L2.rows.length} L2 row(s) and ${payloadL1L3.rows.length} L3 row(s).`
          : `L1 BOM saved. Showing ${payloadL1L2.rows.length} L2 row(s) and ${payloadL1L3.rows.length} L3 row(s).`
      )
    } catch (err) {
      setMessage('')
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  async function calculatePrepTime() {
    if (!parentItem || parentItem.itemType !== 'L2') return

    try {
      setCalculatingPrepTime(true)
      setError('')
      setMessage('Calculating prep time with DeepSeek...')

      const res = await fetch('/api/l2-prep-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: parentItem.id }),
      })
      const data = await safeJson(res)

      if (!res.ok) throw new Error(data?.error || 'Failed to calculate prep time')

      await loadItems()
      setMessage('Prep time estimated. Review the minutes and assumptions, then confirm them.')
    } catch (err) {
      setMessage('')
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setCalculatingPrepTime(false)
    }
  }

  async function confirmPrepTime() {
    if (!parentItem || parentItem.itemType !== 'L2') return

    try {
      setConfirmingPrepTime(true)
      setError('')
      setMessage('')

      const res = await fetch('/api/l2-prep-time', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: parentItem.id,
          setupMinutes: prepSetupMinutes,
          activePrepMinutes: prepActiveMinutes,
          cleanupMinutes: prepCleanupMinutes,
          passiveMinutes: prepPassiveMinutes,
          assumptions: prepTimeAssumptions
            .split('\n')
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      })
      const data = await safeJson(res)

      if (!res.ok) throw new Error(data?.error || 'Failed to confirm prep time')

      await loadItems()
      setSavedBomSignature(currentBomSignature)
      setMessage('Prep time confirmed. This L2 can now be marked as built.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setConfirmingPrepTime(false)
    }
  }

  async function saveL2(buildStatus?: BuildStatus) {
    if (!parentItem) return

    try {
      setError('')
      setMessage(buildStatus === 'BUILT' ? 'Marking L2 as built...' : 'Saving L2 BOM...')

      if (buildStatus === 'BUILT') {
        await patchParentItem('BUILT')
        await loadItems()
        if (!hasUnsavedBomChanges) {
          setSavedBomSignature(currentBomSignature)
        }
        setMessage('L2 marked as built with a confirmed prep time.')
        return
      }

      const validationError =
        validateRows(l2ToL2Rows, 'L2 → L2') || validateRows(l2ToL3Rows, 'L2 → L3')

      if (validationError) {
        setMessage('')
        setError(validationError)
        return
      }

      const hasNoBomRows =
        l2ToL2Rows.filter((row) => row.childId && row.qty !== '').length === 0 &&
        l2ToL3Rows.filter((row) => row.childId && row.qty !== '').length === 0

      if (hasNoBomRows) {
        const confirmed = window.confirm(
          'This L2 has no ingredients or prep components.\n\nSave the empty BOM anyway?\n\nUse this only for free/byproduct prep stock such as fish trim, meat trim, offcuts, breadcrumbs from waste bread, rendered fat, or similar zero-cost prep stock.'
        )

        if (!confirmed) {
          setMessage('')
          return
        }
      }

      await patchParentItem()

      const payloadL2L2 = {
        parentId: parentItem.id,
        rows: l2ToL2Rows
          .filter((row) => row.childId && row.qty !== '')
          .map((row) => ({
            childId: row.childId,
            qty: Number(row.qty),
          })),
      }

      const payloadL2L3 = {
        parentId: parentItem.id,
        rows: l2ToL3Rows
          .filter((row) => row.childId && row.qty !== '')
          .map((row) => ({
            childId: row.childId,
            qty: Number(row.qty),
          })),
      }

      const [l2l2Res, l2l3Res] = await Promise.all([
        fetch('/api/bom/l2-l2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadL2L2),
        }),

        fetch('/api/bom/l2-l3', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadL2L3),
        }),
      ])

      const l2l2Data = await safeJson(l2l2Res)
      const l2l3Data = await safeJson(l2l3Res)

      if (!l2l2Res.ok) throw new Error(l2l2Data?.error || 'Failed to save L2 → L2')
      if (!l2l3Res.ok) throw new Error(l2l3Data?.error || 'Failed to save L2 → L3')

      await Promise.all([loadItems(), loadCosting()])
      setSavedBomSignature(currentBomSignature)

      setMessage(
        `L2 BOM saved. Showing ${payloadL2L2.rows.length} child L2 row(s) and ${payloadL2L3.rows.length} L3 row(s). Calculate or recalculate prep time before marking it as built.`
      )
    } catch (err) {
      setMessage('')
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">BOM Builder</h1>
            <p className="mt-2 text-slate-800">
              Build L0 menus, L1 dishes, and nested L2 prep items from one place.
            </p>
          </div>

          {costingLoading ? (
            <div className="rounded-xl border bg-white px-4 py-2 text-sm text-slate-600">
              Loading costing…
            </div>
          ) : null}
        </div>

        {error ? (
          <CopyableError message={error} className="mt-4" />
        ) : null}

        {message ? (
          <div className="sticky top-4 z-40 mt-4 whitespace-pre-wrap rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700 shadow-sm">
            {message}
          </div>
        ) : null}

        <div className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <label className="mb-2 block text-sm font-medium text-slate-900">
            Parent Item
          </label>

          <select
            value={parentId}
            onChange={(e) => handleParentChange(e.target.value)}
            className="w-full rounded-xl border px-3 py-2"
          >
            <option value="">Select parent item</option>

            {[...l0Items, ...l1Items, ...l2Items].map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} [{item.sku}] ({item.itemType}){' '}
                {item.buildStatus === 'BUILT' ? '— Built' : '— Unbuilt'}
              </option>
            ))}
          </select>

          {hasUnsavedBomChanges ? (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
              Unsaved BOM changes. Save before changing tab or parent item.
            </div>
          ) : null}
        </div>

        {loading ? <div className="mt-6 text-sm text-slate-700">Loading BOM…</div> : null}

        {parentItem ? (
          <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  {parentItem.name} [{parentItem.sku}]
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Type: {parentItem.itemType} · Status:{' '}
                  {parentItem.buildStatus === 'BUILT' ? 'Built' : 'Unbuilt'}
                </p>
              </div>

              {parentItem.itemType === 'L1' ? (
                <div className="w-full md:w-72">
                  <label className="mb-1 block text-sm font-medium text-slate-900">
                    Selling Price €
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={parentSellingPrice}
                    onChange={(e) => setParentSellingPrice(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2"
                    placeholder="Set while costing dish"
                  />
                </div>
              ) : null}

              {parentItem.itemType === 'L2' ? (
                <div className="w-full md:w-72">
                  <label className="mb-1 block text-sm font-medium text-slate-900">
                    Standard Batch Output ({parentItem.unitType})
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={parentStandardBatchOutput}
                    onChange={(e) => setParentStandardBatchOutput(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2"
                    placeholder="Set while building prep"
                  />
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {parentItem?.itemType === 'L0' && l0LiveCosting ? (
          <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">
              L0 Menu Summary — {parentItem.name}
            </h2>

            <div className="mt-5 grid gap-4 md:grid-cols-5">
              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Menu Sales Value</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {money(l0LiveCosting.totalMenuSales)}
                </div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Menu COGS</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {money(l0LiveCosting.totalMenuCogs)}
                </div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Food Cost %</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {percent(l0LiveCosting.foodCostPercent)}
                </div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Gross Margin</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {percent(l0LiveCosting.grossMargin)}
                </div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Warnings</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {l0LiveCosting.missingCostCount === 0
                    ? 'Complete'
                    : `${l0LiveCosting.missingCostCount} missing`}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {parentItem?.itemType === 'L2' && l2LiveCosting ? (
          <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">
              L2 Cost Summary — {parentItem.name}
            </h2>

            <div className="mt-5 grid gap-4 md:grid-cols-4">
              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Standard Batch Output</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {numberLabel(l2LiveCosting.standardBatchOutput)} {parentItem.unitType}
                </div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Total Batch Cost</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {money(l2LiveCosting.totalBatchCost)}
                </div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Cost Per {parentItem.unitType}</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {l2LiveCosting.costPerUnit === null
                    ? '—'
                    : `${money(l2LiveCosting.costPerUnit, 5)} / ${parentItem.unitType}`}
                </div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Warnings</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {l2LiveCosting.missingCostCount === 0
                    ? 'Complete'
                    : `${l2LiveCosting.missingCostCount} missing`}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {parentItem?.itemType === 'L1' && l1LiveCosting ? (
          <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">
              L1 COGS & Margin — {parentItem.name}
            </h2>

            <div className="mt-5 grid gap-4 md:grid-cols-6">
              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Selling Price</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {money(l1LiveCosting.sellingPrice)}
                </div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Total COGS</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {money(l1LiveCosting.totalCogs)}
                </div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Food Cost %</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {percent(l1LiveCosting.foodCostPercent)}
                </div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Gross Profit</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {money(l1LiveCosting.grossProfit)}
                </div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Gross Margin</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {percent(l1LiveCosting.grossMargin)}
                </div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Warnings</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {l1LiveCosting.missingCostCount === 0
                    ? 'Complete'
                    : `${l1LiveCosting.missingCostCount} missing`}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {parentItem?.itemType === 'L0' ? (
          <div className="mt-8 space-y-8">
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">L0 → L1</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Add the L1 dishes on this menu. Qty can be 1 for a normal menu list, or expected
                    weekly sales quantity for forecast planning.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => addRow(setL0ToL1Rows)}
                  className="shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-white"
                >
                  Add L1 Dish
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {l0ToL1Rows.map((row, index) => {
                  const item = getItem(row.childId)
                  const cost = row.childId ? l1CostingByItemId.get(row.childId) ?? null : null
                  const qty = getQty(row.qty)
                  const lineCogs = cost ? qty * cost.foodCost : null
                  const lineSales =
                    cost?.sellingPrice !== null && cost?.sellingPrice !== undefined
                      ? qty * cost.sellingPrice
                      : null

                  const expanded = row.childId ? isL1Expanded(row.childId) : false
                  const expandedBom = row.childId ? expandedL1BomById[row.childId] : null
                  const expandedCosting = row.childId ? expandedL1Costing(row.childId) : null

                  return (
                    <div key={index} className="rounded-2xl border bg-white p-4">
                      <div className="grid gap-3 xl:grid-cols-[minmax(240px,1fr)_160px_140px_140px_150px_110px_100px]">
                        <L1Picker
                          selectedId={row.childId}
                          l1Items={l1Items}
                          onSelect={(id) =>
                            updateRow(l0ToL1Rows, setL0ToL1Rows, index, 'childId', id)
                          }
                        />

                        <QtyInput
                          value={row.qty}
                          unit="each"
                          placeholder="Qty"
                          onChange={(value) =>
                            updateRow(l0ToL1Rows, setL0ToL1Rows, index, 'qty', value)
                          }
                        />

                        <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-800">
                          {cost ? `${money(cost.foodCost)} COGS` : 'Missing costing'}
                        </div>

                        <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-800">
                          {cost?.sellingPrice ? `${money(cost.sellingPrice)} sell` : 'No price'}
                        </div>

                        <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900">
                          {item ? `${money(lineCogs)} / ${money(lineSales)}` : '—'}
                        </div>

                        <button
                          type="button"
                          disabled={!row.childId}
                          onClick={() => toggleL1Expanded(row.childId)}
                          className="rounded-xl border px-3 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {expanded ? 'Collapse' : 'Expand'}
                        </button>

                        <button
                          type="button"
                          onClick={() => removeRow(l0ToL1Rows, setL0ToL1Rows, index)}
                          className="rounded-xl border px-3 py-2"
                        >
                          Remove
                        </button>
                      </div>

                      {expanded && item ? (
                        <div className="mt-4 rounded-2xl border bg-slate-50 p-4">
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                              <h3 className="text-lg font-semibold text-slate-900">
                                {item.name} [{item.sku}]
                              </h3>
                              <p className="mt-1 text-sm text-slate-600">
                                Expanded L1 dish inside this L0 menu.
                              </p>
                            </div>

                            <div className="grid gap-2 text-sm md:grid-cols-4">
                              <div className="rounded-xl border bg-white px-3 py-2">
                                <div className="text-xs text-slate-500">Selling Price</div>
                                <div className="font-semibold text-slate-900">
                                  {money(expandedCosting?.sellingPrice)}
                                </div>
                              </div>

                              <div className="rounded-xl border bg-white px-3 py-2">
                                <div className="text-xs text-slate-500">Food Cost</div>
                                <div className="font-semibold text-slate-900">
                                  {money(expandedCosting?.foodCost)}
                                </div>
                              </div>

                              <div className="rounded-xl border bg-white px-3 py-2">
                                <div className="text-xs text-slate-500">Food Cost %</div>
                                <div className="font-semibold text-slate-900">
                                  {percent(expandedCosting?.foodCostPercent)}
                                </div>
                              </div>

                              <div className="rounded-xl border bg-white px-3 py-2">
                                <div className="text-xs text-slate-500">Margin</div>
                                <div className="font-semibold text-slate-900">
                                  {percent(expandedCosting?.grossMarginPercent)}
                                </div>
                              </div>
                            </div>
                          </div>

                          {expandedBom?.loading ? (
                            <div className="mt-4 rounded-xl border bg-white px-4 py-3 text-sm text-slate-600">
                              Loading L1 BOM…
                            </div>
                          ) : null}

                          {expandedBom?.error ? (
                            <CopyableError message={expandedBom.error} className="mt-4" />
                          ) : null}

                          {expandedBom && !expandedBom.loading && !expandedBom.error ? (
                            <div className="mt-5 grid gap-5 xl:grid-cols-2">
                              <div className="rounded-xl border bg-white p-4">
                                <h4 className="font-semibold text-slate-900">
                                  L2 Prep Components
                                </h4>

                                <div className="mt-3 overflow-x-auto">
                                  <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-100">
                                      <tr>
                                        <th className="px-3 py-2">L2</th>
                                        <th className="px-3 py-2">Qty</th>
                                        <th className="px-3 py-2">Unit Cost</th>
                                        <th className="px-3 py-2">Line Cost</th>
                                      </tr>
                                    </thead>

                                    <tbody>
                                      {expandedBom.l1ToL2Rows.length === 0 ? (
                                        <tr className="border-t">
                                          <td className="px-3 py-2 text-slate-600" colSpan={4}>
                                            No L2 components.
                                          </td>
                                        </tr>
                                      ) : (
                                        expandedBom.l1ToL2Rows.map((bomRow) => {
                                          const l2Cost = getL2Cost(bomRow.l2ItemId)
                                          const lineCost =
                                            l2Cost?.costPerUnit !== null &&
                                            l2Cost?.costPerUnit !== undefined
                                              ? bomRow.qty * l2Cost.costPerUnit
                                              : null

                                          return (
                                            <tr key={bomRow.id} className="border-t">
                                              <td className="px-3 py-2">
                                                <div className="font-medium text-slate-900">
                                                  {bomRow.l2.name}
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                  {bomRow.l2.sku}
                                                </div>
                                              </td>

                                              <td className="px-3 py-2">
                                                {numberLabel(bomRow.qty)} {bomRow.l2.unitType}
                                              </td>

                                              <td className="px-3 py-2">
                                                {l2Cost?.costPerUnit !== null &&
                                                l2Cost?.costPerUnit !== undefined
                                                  ? `${money(l2Cost.costPerUnit, 5)} / ${bomRow.l2.unitType}`
                                                  : 'Missing'}
                                              </td>

                                              <td className="px-3 py-2">{money(lineCost)}</td>
                                            </tr>
                                          )
                                        })
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              <div className="rounded-xl border bg-white p-4">
                                <h4 className="font-semibold text-slate-900">
                                  Direct L3 Ingredients
                                </h4>

                                <div className="mt-3 overflow-x-auto">
                                  <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-100">
                                      <tr>
                                        <th className="px-3 py-2">L3</th>
                                        <th className="px-3 py-2">Qty</th>
                                        <th className="px-3 py-2">Unit Price</th>
                                        <th className="px-3 py-2">Line Cost</th>
                                      </tr>
                                    </thead>

                                    <tbody>
                                      {expandedBom.l1ToL3Rows.length === 0 ? (
                                        <tr className="border-t">
                                          <td className="px-3 py-2 text-slate-600" colSpan={4}>
                                            No direct L3 ingredients.
                                          </td>
                                        </tr>
                                      ) : (
                                        expandedBom.l1ToL3Rows.map((bomRow) => {
                                          const price = getL3Price(bomRow.l3ItemId)
                                          const lineCost = price
                                            ? bomRow.qty * price.unitPrice
                                            : null

                                          return (
                                            <tr key={bomRow.id} className="border-t">
                                              <td className="px-3 py-2">
                                                <div className="font-medium text-slate-900">
                                                  {bomRow.l3.name}
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                  {bomRow.l3.sku}
                                                </div>
                                              </td>

                                              <td className="px-3 py-2">
                                                {numberLabel(bomRow.qty)} {bomRow.l3.unitType}
                                              </td>

                                              <td className="px-3 py-2">
                                                {price
                                                  ? `${money(price.unitPrice, 5)} / ${bomRow.l3.unitType}`
                                                  : 'Missing'}
                                              </td>

                                              <td className="px-3 py-2">{money(lineCost)}</td>
                                            </tr>
                                          )
                                        })
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </section>

            {false && parentItem ? (
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">L2 Prep Time</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Save the BOM first, calculate an estimate, review it, then confirm it.
                    Child L2 production time is excluded because those items are planned separately.
                  </p>
                </div>

                <span
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    parentItem?.prepTimeStatus === 'CONFIRMED'
                      ? 'bg-green-50 text-green-700'
                      : parentItem?.prepTimeStatus === 'ESTIMATED'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  {parentItem?.prepTimeStatus || 'MISSING'}
                </span>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-900">
                    Setup minutes
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={prepSetupMinutes}
                    onChange={(e) => setPrepSetupMinutes(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-900">
                    Active prep minutes
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={prepActiveMinutes}
                    onChange={(e) => setPrepActiveMinutes(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-900">
                    Cleanup minutes
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={prepCleanupMinutes}
                    onChange={(e) => setPrepCleanupMinutes(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-900">
                    Passive minutes
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={prepPassiveMinutes}
                    onChange={(e) => setPrepPassiveMinutes(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2"
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Hands-on per batch</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">
                    {numberLabel(
                      getQty(prepSetupMinutes) +
                        getQty(prepActiveMinutes) +
                        getQty(prepCleanupMinutes),
                      1
                    )}{' '}
                    min
                  </div>
                </div>

                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Elapsed per batch</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">
                    {numberLabel(
                      getQty(prepSetupMinutes) +
                        getQty(prepActiveMinutes) +
                        getQty(prepCleanupMinutes) +
                        getQty(prepPassiveMinutes),
                      1
                    )}{' '}
                    min
                  </div>
                </div>

                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">AI confidence</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">
                    {parentItem?.prepTimeConfidence === null ||
                    parentItem?.prepTimeConfidence === undefined
                      ? 'N/A'
                      : `${Math.round((parentItem?.prepTimeConfidence ?? 0) * 100)}%`}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium text-slate-900">
                  Assumptions
                </label>
                <textarea
                  value={prepTimeAssumptions}
                  onChange={(e) => setPrepTimeAssumptions(e.target.value)}
                  className="h-28 w-full rounded-xl border px-3 py-2 text-sm"
                  placeholder="One assumption per line"
                />
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={calculatePrepTime}
                  disabled={calculatingPrepTime}
                  className="rounded-xl bg-slate-900 px-5 py-3 text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {calculatingPrepTime ? 'Calculating...' : 'Calculate Prep Time'}
                </button>

                <button
                  type="button"
                  onClick={confirmPrepTime}
                  disabled={
                    confirmingPrepTime ||
                    (parentItem?.prepTimeStatus !== 'ESTIMATED' &&
                      parentItem?.prepTimeStatus !== 'CONFIRMED')
                  }
                  className="rounded-xl border border-green-400 px-5 py-3 font-medium text-green-800 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {confirmingPrepTime ? 'Confirming...' : 'Confirm Prep Time'}
                </button>
              </div>
            </section>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => saveL0()}
                className="rounded-xl border px-5 py-3 text-slate-800 hover:bg-slate-50"
              >
                Save L0 BOM
              </button>

              <button
                type="button"
                onClick={() => saveL0('BUILT')}
                className="rounded-xl bg-green-700 px-5 py-3 text-white"
              >
                Save L0 as Built
              </button>
            </div>
          </div>
        ) : null}

        {parentItem?.itemType === 'L1' ? (
          <div className="mt-8 space-y-8">
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">L1 → L2</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Enter how much of each L2 prep item is used per dish.
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
                  const qty = getQty(row.qty)
                  const lineCost =
                    cost?.costPerUnit !== null && cost?.costPerUnit !== undefined
                      ? qty * cost.costPerUnit
                      : null

                  return (
                    <div
                      key={index}
                      className="grid gap-3 md:grid-cols-[1fr_220px_150px_150px_100px]"
                    >
                      <L2Picker
                        selectedId={row.childId}
                        l2Items={l2Items}
                        onSelect={(id) =>
                          updateRow(l1ToL2Rows, setL1ToL2Rows, index, 'childId', id)
                        }
                      />

                      <QtyInput
                        value={row.qty}
                        unit={getUnit(row.childId)}
                        placeholder="Qty per dish"
                        onChange={(value) =>
                          updateRow(l1ToL2Rows, setL1ToL2Rows, index, 'qty', value)
                        }
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
                  <p className="mt-1 text-sm text-slate-600">
                    Enter direct ingredient quantities per dish.
                  </p>
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
                  const qty = getQty(row.qty)
                  const lineCost = price ? qty * price.unitPrice : null

                  return (
                    <div
                      key={index}
                      className="grid gap-3 md:grid-cols-[1fr_220px_150px_150px_100px]"
                    >
                      <L3SearchPicker
                        selectedId={row.childId}
                        l3Items={l3Items}
                        onError={setError}
                        onSelect={(id) =>
                          updateRow(l1ToL3Rows, setL1ToL3Rows, index, 'childId', id)
                        }
                      />

                      <QtyInput
                        value={row.qty}
                        unit={getUnit(row.childId)}
                        placeholder="Qty per dish"
                        onChange={(value) =>
                          updateRow(l1ToL3Rows, setL1ToL3Rows, index, 'qty', value)
                        }
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

            {false && parentItem ? (
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">L2 Prep Time</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Review the DeepSeek estimate for one standard batch, correct it if needed,
                    then confirm it.
                  </p>
                </div>
                <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
                  {parentItem?.prepTimeStatus || 'MISSING'}
                </span>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Setup minutes', prepSetupMinutes, setPrepSetupMinutes],
                  ['Active prep minutes', prepActiveMinutes, setPrepActiveMinutes],
                  ['Cleanup minutes', prepCleanupMinutes, setPrepCleanupMinutes],
                  ['Passive minutes', prepPassiveMinutes, setPrepPassiveMinutes],
                ].map(([label, value, setter]) => (
                  <div key={String(label)}>
                    <label className="mb-1 block text-sm font-medium text-slate-900">
                      {String(label)}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={String(value)}
                      onChange={(e) => (setter as (value: string) => void)(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Hands-on per batch</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">
                    {numberLabel(
                      getQty(prepSetupMinutes) +
                        getQty(prepActiveMinutes) +
                        getQty(prepCleanupMinutes),
                      1
                    )}{' '}
                    min
                  </div>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Elapsed per batch</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">
                    {numberLabel(
                      getQty(prepSetupMinutes) +
                        getQty(prepActiveMinutes) +
                        getQty(prepCleanupMinutes) +
                        getQty(prepPassiveMinutes),
                      1
                    )}{' '}
                    min
                  </div>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">AI confidence</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">
                    {parentItem?.prepTimeConfidence === null ||
                    parentItem?.prepTimeConfidence === undefined
                      ? 'N/A'
                      : `${Math.round((parentItem?.prepTimeConfidence ?? 0) * 100)}%`}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium text-slate-900">
                  Assumptions
                </label>
                <textarea
                  value={prepTimeAssumptions}
                  onChange={(e) => setPrepTimeAssumptions(e.target.value)}
                  className="h-28 w-full rounded-xl border px-3 py-2 text-sm"
                  placeholder="One assumption per line"
                />
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={calculatePrepTime}
                  disabled={calculatingPrepTime}
                  className="rounded-xl bg-slate-900 px-5 py-3 text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {calculatingPrepTime ? 'Calculating...' : 'Calculate Prep Time'}
                </button>
                <button
                  type="button"
                  onClick={confirmPrepTime}
                  disabled={
                    confirmingPrepTime ||
                    (parentItem?.prepTimeStatus !== 'ESTIMATED' &&
                      parentItem?.prepTimeStatus !== 'CONFIRMED')
                  }
                  className="rounded-xl border border-green-400 px-5 py-3 font-medium text-green-800 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {confirmingPrepTime ? 'Confirming...' : 'Confirm Prep Time'}
                </button>
              </div>
            </section>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => saveL1()}
                className="rounded-xl border px-5 py-3 text-slate-800 hover:bg-slate-50"
              >
                Save L1 BOM
              </button>

              <button
                type="button"
                onClick={() => saveL1('BUILT')}
                className="rounded-xl bg-green-700 px-5 py-3 text-white"
              >
                Save L1 as Built
              </button>
            </div>
          </div>
        ) : null}

        {parentItem?.itemType === 'L2' ? (
          <div className="mt-8 space-y-8">
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">L2 → L2</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Add prepared L2 components used inside this L2 batch, for example stock inside a puree.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => addRow(setL2ToL2Rows)}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-white"
                >
                  Add L2 Row
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {l2ToL2Rows.map((row, index) => {
                  const item = getItem(row.childId)
                  const cost = getL2Cost(row.childId)
                  const qty = getQty(row.qty)
                  const lineCost =
                    cost?.costPerUnit !== null && cost?.costPerUnit !== undefined
                      ? qty * cost.costPerUnit
                      : null

                  return (
                    <div
                      key={index}
                      className="grid gap-3 md:grid-cols-[1fr_220px_150px_150px_100px]"
                    >
                      <L2Picker
                        selectedId={row.childId}
                        l2Items={l2ChildOptions}
                        onSelect={(id) =>
                          updateRow(l2ToL2Rows, setL2ToL2Rows, index, 'childId', id)
                        }
                      />

                      <QtyInput
                        value={row.qty}
                        unit={getUnit(row.childId)}
                        placeholder="Qty per batch"
                        onChange={(value) =>
                          updateRow(l2ToL2Rows, setL2ToL2Rows, index, 'qty', value)
                        }
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
                        onClick={() => removeRow(l2ToL2Rows, setL2ToL2Rows, index)}
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
                  <h2 className="text-xl font-semibold text-slate-900">L2 → L3</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Enter bought ingredients used to make one standard batch.
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
                  const qty = getQty(row.qty)
                  const lineCost = price ? qty * price.unitPrice : null

                  return (
                    <div
                      key={index}
                      className="grid gap-3 md:grid-cols-[1fr_220px_150px_150px_100px]"
                    >
                      <L3SearchPicker
                        selectedId={row.childId}
                        l3Items={l3Items}
                        onError={setError}
                        onSelect={(id) =>
                          updateRow(l2ToL3Rows, setL2ToL3Rows, index, 'childId', id)
                        }
                      />

                      <QtyInput
                        value={row.qty}
                        unit={getUnit(row.childId)}
                        placeholder="Qty per batch"
                        onChange={(value) =>
                          updateRow(l2ToL3Rows, setL2ToL3Rows, index, 'qty', value)
                        }
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

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">L2 Prep Time</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Review the estimate for one standard batch, correct it if needed, then confirm it.
                  </p>
                </div>
                <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
                  {parentItem.prepTimeStatus || 'MISSING'}
                </span>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-sm font-medium text-slate-900">
                  Setup minutes
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={prepSetupMinutes}
                    onChange={(e) => setPrepSetupMinutes(e.target.value)}
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                  />
                </label>
                <label className="text-sm font-medium text-slate-900">
                  Active prep minutes
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={prepActiveMinutes}
                    onChange={(e) => setPrepActiveMinutes(e.target.value)}
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                  />
                </label>
                <label className="text-sm font-medium text-slate-900">
                  Cleanup minutes
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={prepCleanupMinutes}
                    onChange={(e) => setPrepCleanupMinutes(e.target.value)}
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                  />
                </label>
                <label className="text-sm font-medium text-slate-900">
                  Passive minutes
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={prepPassiveMinutes}
                    onChange={(e) => setPrepPassiveMinutes(e.target.value)}
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Hands-on per batch</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">
                    {numberLabel(
                      getQty(prepSetupMinutes) +
                        getQty(prepActiveMinutes) +
                        getQty(prepCleanupMinutes),
                      1
                    )}{' '}
                    min
                  </div>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Elapsed per batch</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">
                    {numberLabel(
                      getQty(prepSetupMinutes) +
                        getQty(prepActiveMinutes) +
                        getQty(prepCleanupMinutes) +
                        getQty(prepPassiveMinutes),
                      1
                    )}{' '}
                    min
                  </div>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">AI confidence</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">
                    {parentItem.prepTimeConfidence === null ||
                    parentItem.prepTimeConfidence === undefined
                      ? 'N/A'
                      : `${Math.round(parentItem.prepTimeConfidence * 100)}%`}
                  </div>
                </div>
              </div>

              <label className="mt-4 block text-sm font-medium text-slate-900">
                Assumptions
                <textarea
                  value={prepTimeAssumptions}
                  onChange={(e) => setPrepTimeAssumptions(e.target.value)}
                  className="mt-1 h-28 w-full rounded-xl border px-3 py-2 text-sm"
                  placeholder="One assumption per line"
                />
              </label>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={calculatePrepTime}
                  disabled={calculatingPrepTime}
                  className="rounded-xl bg-slate-900 px-5 py-3 text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {calculatingPrepTime ? 'Calculating...' : 'Calculate Prep Time'}
                </button>
                <button
                  type="button"
                  onClick={confirmPrepTime}
                  disabled={
                    confirmingPrepTime ||
                    (parentItem.prepTimeStatus !== 'ESTIMATED' &&
                      parentItem.prepTimeStatus !== 'CONFIRMED')
                  }
                  className="rounded-xl border border-green-400 px-5 py-3 font-medium text-green-800 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {confirmingPrepTime ? 'Confirming...' : 'Confirm Prep Time'}
                </button>
              </div>
            </section>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => saveL2()}
                className="rounded-xl border px-5 py-3 text-slate-800 hover:bg-slate-50"
              >
                Save L2 BOM
              </button>

              <button
                type="button"
                onClick={() => saveL2('BUILT')}
                disabled={parentItem.prepTimeStatus !== 'CONFIRMED'}
                className="rounded-xl bg-green-700 px-5 py-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save L2 as Built
              </button>
            </div>
          </div>
        ) : null}

        {!parentItem ? (
          <div className="mt-8 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Select an L0, L1, or L2 parent item to begin building.
          </div>
        ) : null}
      </div>
    </main>
  )
}
