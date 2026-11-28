'use client'

import Link from 'next/link'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, FilterX, Link2, Sparkles, Trash2 } from 'lucide-react'
import CopyableError from '@/app/components/CopyableError'
import SortableTableHeader from '@/app/components/SortableTableHeader'

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
  serviceBatchSize: number | null
  serviceHandsOnMinutes: number | null
  serviceElapsedMinutes: number | null
  serviceTimeConfidence: number | null
  serviceTimeStatus: PrepTimeStatus
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
  labourCostingEnabled: boolean
  blendedLabourRatePerHour: number | null
  prepLabourMinutes: number | null
  serviceLabourMinutes: number | null
  totalLabourMinutes: number | null
  labourCost: number | null
  contributionAfterLabour: number | null
  contributionAfterLabourPercent: number | null
  missingLabourCount: number
  serviceBatchSize: number | null
  serviceHandsOnMinutesPerBatch: number | null
  serviceElapsedMinutesPerBatch: number | null
  serviceTimeConfidence: number | null
  serviceTimeStatus: PrepTimeStatus
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
    lineLabourMinutes: number | null
    missingReason: string | null
    missingCostCount: number
    missingLabourCount: number
    labourMinutesPerUnit: number | null
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

type ItemDeletionPlan = {
  canDelete: boolean
  blockingRecords: Record<string, number>
  menuLinksRemoved: number
  directL2Count: number
  directL3Count: number
  deletedL2Count: number
  deletedL3Count: number
  preservedL2Count: number
  preservedL3Count: number
}

type ItemSortKey =
  | 'sku'
  | 'name'
  | 'itemType'
  | 'buildStatus'
  | 'unitType'
  | 'shelfLifeDays'
  | 'sellingPrice'
  | 'foodCost'
  | 'grossMarginPercent'
  | 'standardBatchOutput'
  | 'prepTime'

type SortDirection = 'asc' | 'desc'

type BulkPrepTimeReport = {
  kind: 'success' | 'warning' | 'error'
  text: string
}

const ITEM_LIST_PREFERENCES_KEY = 'flowdish:item-list-preferences:v1'
const ITEM_SORT_KEYS: ItemSortKey[] = [
  'sku',
  'name',
  'itemType',
  'buildStatus',
  'unitType',
  'shelfLifeDays',
  'sellingPrice',
  'foodCost',
  'grossMarginPercent',
  'standardBatchOutput',
  'prepTime',
]
const itemCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

function compareItemValues(
  first: string | number | null | undefined,
  second: string | number | null | undefined,
  direction: SortDirection
) {
  const firstMissing = first === null || first === undefined || first === ''
  const secondMissing = second === null || second === undefined || second === ''

  if (firstMissing && secondMissing) return 0
  if (firstMissing) return 1
  if (secondMissing) return -1

  const comparison =
    typeof first === 'number' && typeof second === 'number'
      ? first - second
      : itemCollator.compare(String(first), String(second))

  return direction === 'asc' ? comparison : -comparison
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
  const router = useRouter()
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
  const [sortKey, setSortKey] = useState<ItemSortKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [listPreferencesLoaded, setListPreferencesLoaded] = useState(false)

  const [loading, setLoading] = useState(false)
  const [costingLoading, setCostingLoading] = useState(false)
  const [bulkCalculatingPrepTime, setBulkCalculatingPrepTime] = useState(false)
  const [bulkPrepTimeReport, setBulkPrepTimeReport] = useState<BulkPrepTimeReport | null>(null)
  const [copyingItemId, setCopyingItemId] = useState<string | null>(null)
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)
  const [deleteMenuItemId, setDeleteMenuItemId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const costingByItemId = useMemo(() => {
    return new Map(costingRows.map((row) => [row.itemId, row]))
  }, [costingRows])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()

    const matchingItems = items.filter((item) => {
      const matchesType = typeFilter === 'ALL' || item.itemType === typeFilter
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q)

      return matchesType && matchesSearch
    })

    if (!sortKey) return matchingItems

    return [...matchingItems].sort((first, second) => {
      const firstCosting = costingByItemId.get(first.id)
      const secondCosting = costingByItemId.get(second.id)

      if (sortKey === 'sku') {
        return compareItemValues(first.sku, second.sku, sortDirection)
      }
      if (sortKey === 'name') {
        return compareItemValues(first.name, second.name, sortDirection)
      }
      if (sortKey === 'itemType') {
        return compareItemValues(first.itemType, second.itemType, sortDirection)
      }
      if (sortKey === 'buildStatus') {
        return compareItemValues(first.buildStatus, second.buildStatus, sortDirection)
      }
      if (sortKey === 'unitType') {
        return compareItemValues(
          first.itemType === 'L0' || first.itemType === 'L1' ? null : first.unitType,
          second.itemType === 'L0' || second.itemType === 'L1' ? null : second.unitType,
          sortDirection
        )
      }
      if (sortKey === 'shelfLifeDays') {
        return compareItemValues(first.shelfLifeDays, second.shelfLifeDays, sortDirection)
      }
      if (sortKey === 'sellingPrice') {
        return compareItemValues(first.sellingPrice, second.sellingPrice, sortDirection)
      }
      if (sortKey === 'foodCost') {
        return compareItemValues(firstCosting?.foodCost, secondCosting?.foodCost, sortDirection)
      }
      if (sortKey === 'grossMarginPercent') {
        return compareItemValues(
          firstCosting?.grossMarginPercent,
          secondCosting?.grossMarginPercent,
          sortDirection
        )
      }
      if (sortKey === 'standardBatchOutput') {
        return compareItemValues(
          first.standardBatchOutput,
          second.standardBatchOutput,
          sortDirection
        )
      }

      const firstPrepTime =
        first.itemType === 'L2'
          ? first.prepHandsOnMinutes
          : first.itemType === 'L1'
            ? first.serviceHandsOnMinutes
            : null
      const secondPrepTime =
        second.itemType === 'L2'
          ? second.prepHandsOnMinutes
          : second.itemType === 'L1'
            ? second.serviceHandsOnMinutes
            : null

      return compareItemValues(firstPrepTime, secondPrepTime, sortDirection)
    })
  }, [costingByItemId, items, search, sortDirection, sortKey, typeFilter])

  function handleItemSort(nextSortKey: ItemSortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(nextSortKey)
    setSortDirection('asc')
  }

  function clearItemFilters() {
    setSearch('')
    setTypeFilter('ALL')
    setSortKey(null)
    setSortDirection('asc')
  }

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
      setMessage('')
      setBulkPrepTimeReport(null)

      const res = await fetch('/api/l2-prep-time/bulk', { method: 'POST' })
      const data = await safeJson(res)

      if (!res.ok) throw new Error(data?.error || 'Failed to calculate prep times')

      await loadItems()
      const attempted = Number(data.attempted) || 0
      const calculated = Number(data.calculated) || 0
      const failed = Array.isArray(data.failed) ? data.failed.length : 0
      const remaining = Number(data.remaining) || 0
      const awaitingBatchOutput = Number(data.awaitingBatchOutput) || 0

      if (attempted === 0 && awaitingBatchOutput === 0) {
        setBulkPrepTimeReport({
          kind: 'success',
          text: 'No L2 prep times are left to calculate.',
        })
        return
      }

      if (attempted === 0) {
        setBulkPrepTimeReport({
          kind: 'warning',
          text: `No prep times were estimated. ${awaitingBatchOutput} L2${awaitingBatchOutput === 1 ? '' : 's'} need a standard batch output first.`,
        })
        return
      }

      const report = [
        `${calculated} L2 prep time${calculated === 1 ? '' : 's'} estimated.`,
        failed > 0 ? `${failed} could not be estimated.` : '',
        remaining > 0 ? `${remaining} remain for the next batch.` : 'No calculable L2s remain.',
        awaitingBatchOutput > 0
          ? `${awaitingBatchOutput} need a standard batch output first.`
          : '',
      ]
        .filter(Boolean)
        .join(' ')

      setBulkPrepTimeReport({
        kind: failed > 0 || awaitingBatchOutput > 0 ? 'warning' : 'success',
        text: report,
      })
    } catch (err) {
      setMessage('')
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      setBulkPrepTimeReport({ kind: 'error', text: errorMessage })
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

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(ITEM_LIST_PREFERENCES_KEY)
      if (!stored) return

      const preferences = JSON.parse(stored) as Record<string, unknown>
      if (typeof preferences.search === 'string') setSearch(preferences.search)
      if (
        preferences.typeFilter === 'ALL' ||
        preferences.typeFilter === 'L0' ||
        preferences.typeFilter === 'L1' ||
        preferences.typeFilter === 'L2' ||
        preferences.typeFilter === 'L3'
      ) {
        setTypeFilter(preferences.typeFilter)
      }
      if (
        typeof preferences.sortKey === 'string' &&
        ITEM_SORT_KEYS.includes(preferences.sortKey as ItemSortKey)
      ) {
        setSortKey(preferences.sortKey as ItemSortKey)
      }
      if (preferences.sortDirection === 'asc' || preferences.sortDirection === 'desc') {
        setSortDirection(preferences.sortDirection)
      }
    } catch {
      window.sessionStorage.removeItem(ITEM_LIST_PREFERENCES_KEY)
    } finally {
      setListPreferencesLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (!listPreferencesLoaded) return

    window.sessionStorage.setItem(
      ITEM_LIST_PREFERENCES_KEY,
      JSON.stringify({ search, typeFilter, sortKey, sortDirection })
    )
  }, [listPreferencesLoaded, search, sortDirection, sortKey, typeFilter])

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setMessage('')

    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const buildAfterSave = submitter?.value === 'build'

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

      if (buildAfterSave && itemType !== 'L3') {
        router.push(`/items/build?parentId=${encodeURIComponent(data.id)}`)
        return
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

  async function finishItemDeletion(id: string, message: string) {
    if (expandedCostingId === id) setExpandedCostingId(null)
    setDeleteMenuItemId(null)
    setMessage(message)
    scrollToMessage()
    await loadData()
  }

  function deletionBlockerMessage(plan: ItemDeletionPlan) {
    const labels: Record<string, string> = {
      deliveries: 'deliveries',
      inventoryLots: 'inventory lots',
      prepBatches: 'prep entries',
      sales: 'sales',
      salesModifierAdjustments: 'sales adjustments',
      wastes: 'waste entries',
      forecastLines: 'forecast entries',
      supplierProducts: 'supplier product links',
    }
    const blockers = Object.entries(plan.blockingRecords)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => `${count} ${labels[key] || key}`)

    return blockers.length > 0
      ? `This L1 cannot be permanently deleted because it has ${blockers.join(', ')}. Its audit history has been preserved.`
      : 'This L1 cannot be permanently deleted because it has protected activity history.'
  }

  async function handleL1Delete(item: Item, mode: 'recipe' | 'item_only') {
    setError('')
    setMessage('')
    setDeleteMenuItemId(null)

    try {
      setDeletingItemId(item.id)
      const previewRes = await fetch(
        `/api/items/delete-preview?id=${encodeURIComponent(item.id)}&mode=${mode}`,
        { cache: 'no-store' }
      )
      const plan = (await safeJson(previewRes)) as ItemDeletionPlan & { error?: string }

      if (!previewRes.ok) throw new Error(plan.error || 'Failed to prepare delete warning')
      if (!plan.canDelete) throw new Error(deletionBlockerMessage(plan))

      const preservedCount = plan.preservedL2Count + plan.preservedL3Count
      const warning =
        mode === 'recipe'
          ? `Delete entire recipe: ${item.name} [${item.sku}]?\n\nThis permanently deletes:\n- the L1 dish, its BOM and SOP\n- ${plan.deletedL2Count} unshared L2 component(s)\n- ${plan.deletedL3Count} unshared L3 ingredient(s)\n\n${preservedCount} shared, linked or previously used child item(s) will be kept.${plan.menuLinksRemoved > 0 ? `\n${plan.menuLinksRemoved} L0 menu link(s) will be removed.` : ''}\n\nThis cannot be undone.`
          : `Delete only this L1: ${item.name} [${item.sku}]?\n\nThe L1, its BOM and SOP will be deleted. All attached L2 and L3 items will remain in My Items.${plan.menuLinksRemoved > 0 ? `\n${plan.menuLinksRemoved} L0 menu link(s) will be removed.` : ''}\n\nThis cannot be undone.`

      if (!window.confirm(warning)) return

      const res = await fetch(
        `/api/items?id=${encodeURIComponent(item.id)}&mode=${mode}`,
        { method: 'DELETE' }
      )
      const data = await safeJson(res)

      if (!res.ok) throw new Error(data.error || 'Failed to delete recipe')

      await finishItemDeletion(
        item.id,
        mode === 'recipe'
          ? `Recipe deleted. ${data.deletedL2Count} L2 and ${data.deletedL3Count} L3 item(s) removed; ${data.preservedL2Count + data.preservedL3Count} shared or used item(s) kept.`
          : 'L1 deleted. Its L2 and L3 items were kept.'
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      scrollToMessage()
    } finally {
      setDeletingItemId(null)
    }
  }

  async function handleDelete(item: Item) {
    setError('')
    setMessage('')

    const confirmed = window.confirm(`Delete item: ${item.name} [${item.sku}]?`)
    if (!confirmed) return

    try {
      setDeletingItemId(item.id)
      const res = await fetch(`/api/items?id=${item.id}`, { method: 'DELETE' })
      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete item')
      }

      await finishItemDeletion(item.id, 'Item deleted.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      scrollToMessage()
    } finally {
      setDeletingItemId(null)
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

  async function copyItem(item: Item) {
    setError('')
    setMessage('')

    const confirmed = window.confirm(
      `Copy ${item.name} [${item.sku}] to a new ${item.itemType} item?\n\nThe BOM and SOP will be copied, but the new item will stay unbuilt until reviewed.`
    )
    if (!confirmed) return

    try {
      setCopyingItemId(item.id)
      const res = await fetch('/api/items/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceItemId: item.id }),
      })
      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data.error || 'Failed to copy item')
      }

      setMessage(`Copied to ${data.item.name} [${data.item.sku}]. Use Build to make changes.`)
      setTypeFilter(data.item.itemType)
      setSearch(data.item.sku)
      scrollToMessage()
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      scrollToMessage()
    } finally {
      setCopyingItemId(null)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">My Items</h1>
            <p className="mt-2 text-slate-800">
              Create, build, and cost L0 menus, L1 dishes, L2 prep items, and L3 ingredients.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/suppliers?linkFilter=UNLINKED#product-catalogue"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-teal-700 px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50"
            >
              <Link2 aria-hidden="true" className="h-4 w-4" />
              Pair Unmatched L3s
            </Link>
            <Link
              href="/items/build?import=recipe"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              <Sparkles aria-hidden="true" className="h-4 w-4" />
              AI Recipe Import
            </Link>
            <button
              type="button"
              onClick={refreshCosting}
              disabled={costingLoading}
              className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {costingLoading ? 'Refreshing costing…' : 'Refresh L1 Costing'}
            </button>
          </div>
        </div>

        <div ref={messageRef}>
          {error ? (
            <CopyableError message={error} className="mt-4" />
          ) : null}

          {message ? (
            <div className="sticky top-4 z-40 mt-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700 shadow-sm">
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

          <div className="flex flex-wrap items-end gap-2">
            <button
              type="submit"
              value="save"
              className="rounded-xl bg-slate-900 px-4 py-2 text-white"
            >
              Save Item
            </button>
            {itemType !== 'L3' ? (
              <button
                type="submit"
                value="build"
                className="rounded-xl border border-slate-900 px-4 py-2 font-medium text-slate-900 hover:bg-slate-50"
              >
                Save &amp; Build
              </button>
            ) : null}
          </div>

          {(itemType === 'L0' || itemType === 'L1' || itemType === 'L2') ? (
            <div className="md:col-span-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {itemType === 'L0'
                ? 'Build this L0 menu by adding its L1 dishes.'
                : itemType === 'L1'
                  ? 'Selling price and recipe costing are handled when you build this L1 dish.'
                  : 'Standard batch output is handled when you build this L2 prep item.'}
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

        <div className="mt-4 rounded-xl border bg-white px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-700">
              L2 prep times are estimated in batches of five. Review and confirm each estimate in
              the item&apos;s Build workspace before it is complete.
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

          {bulkPrepTimeReport ? (
            <div
              aria-live="polite"
              className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                bulkPrepTimeReport.kind === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : bulkPrepTimeReport.kind === 'warning'
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-green-200 bg-green-50 text-green-700'
              }`}
            >
              {bulkPrepTimeReport.text}
            </div>
          ) : null}
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b px-6 py-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">My Items List</h2>
              <p className="mt-1 text-sm text-slate-700">
                Showing {filteredItems.length} of {items.length} items.
              </p>
            </div>
            <button
              type="button"
              onClick={clearItemFilters}
              disabled={!search && typeFilter === 'ALL' && sortKey === null}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FilterX aria-hidden="true" className="h-4 w-4" />
              Clear filters
            </button>
          </div>
          <div className="max-h-[70vh] overflow-auto">
            <table className="min-w-[1200px] w-full text-left">
              <thead className="sticky top-0 z-20 bg-slate-100 text-sm shadow-[0_1px_0_0_rgba(148,163,184,0.55)]">
                <tr>
                  <SortableTableHeader
                    label="SKU"
                    active={sortKey === 'sku'}
                    direction={sortDirection}
                    onSort={() => handleItemSort('sku')}
                  />
                  <SortableTableHeader
                    label="Name"
                    active={sortKey === 'name'}
                    direction={sortDirection}
                    onSort={() => handleItemSort('name')}
                  />
                  <th className="px-4 py-3 text-slate-800">Actions</th>
                  <SortableTableHeader
                    label="Type"
                    active={sortKey === 'itemType'}
                    direction={sortDirection}
                    onSort={() => handleItemSort('itemType')}
                  />
                  <SortableTableHeader
                    label="Build"
                    active={sortKey === 'buildStatus'}
                    direction={sortDirection}
                    onSort={() => handleItemSort('buildStatus')}
                  />
                  <SortableTableHeader
                    label="Unit"
                    active={sortKey === 'unitType'}
                    direction={sortDirection}
                    onSort={() => handleItemSort('unitType')}
                  />
                  <SortableTableHeader
                    label="Shelf Life"
                    active={sortKey === 'shelfLifeDays'}
                    direction={sortDirection}
                    onSort={() => handleItemSort('shelfLifeDays')}
                  />
                  <SortableTableHeader
                    label="Selling Price"
                    active={sortKey === 'sellingPrice'}
                    direction={sortDirection}
                    onSort={() => handleItemSort('sellingPrice')}
                  />
                  <SortableTableHeader
                    label="Food Cost"
                    active={sortKey === 'foodCost'}
                    direction={sortDirection}
                    onSort={() => handleItemSort('foodCost')}
                  />
                  <SortableTableHeader
                    label="Gross Margin"
                    active={sortKey === 'grossMarginPercent'}
                    direction={sortDirection}
                    onSort={() => handleItemSort('grossMarginPercent')}
                  />
                  <SortableTableHeader
                    label="Std Batch Output"
                    active={sortKey === 'standardBatchOutput'}
                    direction={sortDirection}
                    onSort={() => handleItemSort('standardBatchOutput')}
                  />
                  <SortableTableHeader
                    label="Prep / Service Time"
                    active={sortKey === 'prepTime'}
                    direction={sortDirection}
                    onSort={() => handleItemSort('prepTime')}
                  />
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
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              {item.itemType === 'L0' ||
                              item.itemType === 'L1' ||
                              item.itemType === 'L2' ? (
                                <Link
                                  href={`/items/build?parentId=${item.id}`}
                                  className="rounded-lg border border-blue-300 px-3 py-1 text-sm text-blue-700 hover:bg-blue-50"
                                >
                                  {item.buildStatus === 'BUILT' ? 'Edit Build' : 'Build'}
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

                              {item.itemType === 'L1' || item.itemType === 'L2' ? (
                                <button
                                  type="button"
                                  onClick={() => copyItem(item)}
                                  disabled={copyingItemId === item.id}
                                  className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {copyingItemId === item.id ? 'Copying...' : 'Copy to New'}
                                </button>
                              ) : null}

                              {item.itemType === 'L1' ? (
                                <div className="relative inline-flex">
                                  <button
                                    type="button"
                                    onClick={() => handleL1Delete(item, 'recipe')}
                                    disabled={deletingItemId === item.id}
                                    className="inline-flex items-center gap-1.5 rounded-l-lg border border-r-0 border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                                    {deletingItemId === item.id ? 'Checking...' : 'Delete recipe'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDeleteMenuItemId((current) =>
                                        current === item.id ? null : item.id
                                      )
                                    }
                                    disabled={deletingItemId === item.id}
                                    className="inline-flex items-center justify-center rounded-r-lg border border-red-300 px-2 py-1 text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                    aria-label={`More delete options for ${item.name}`}
                                    aria-expanded={deleteMenuItemId === item.id}
                                    title="More delete options"
                                  >
                                    <ChevronDown aria-hidden="true" className="h-4 w-4" />
                                  </button>

                                  {deleteMenuItemId === item.id ? (
                                    <div className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-lg border bg-white py-1 shadow-lg">
                                      <button
                                        type="button"
                                        onClick={() => handleL1Delete(item, 'recipe')}
                                        className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                                      >
                                        Delete recipe + unused items
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleL1Delete(item, 'item_only')}
                                        className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                                      >
                                        Delete L1 only
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(item)}
                                  disabled={deletingItemId === item.id}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                                  {deletingItemId === item.id ? 'Deleting...' : 'Delete'}
                                </button>
                              )}
                            </div>
                          </td>
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
                            ) : item.itemType === 'L1' && costing?.labourCostingEnabled ? (
                              <div className="min-w-40">
                                <div className="font-medium">
                                  {minuteLabel(item.serviceHandsOnMinutes)} hands-on
                                </div>
                                <div className="text-xs text-slate-500">
                                  {item.serviceBatchSize && item.serviceBatchSize > 0
                                    ? `${item.serviceBatchSize} portions / batch`
                                    : 'Batch size missing'}
                                </div>
                                <div className="mt-1 text-xs font-medium text-slate-600">
                                  {item.serviceTimeStatus}
                                  {item.serviceTimeConfidence === null
                                    ? ''
                                    : ` · ${Math.round(item.serviceTimeConfidence * 100)}% confidence`}
                                </div>
                              </div>
                            ) : (
                              'N/A'
                            )}
                          </td>
                        </tr>

                        {expanded && item.itemType === 'L1' && costing ? (
                          <tr className="border-t bg-slate-50">
                            <td colSpan={12} className="px-4 py-5">
                              <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
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
                                  <div className="mt-1 text-xs text-slate-500">
                                    {percent(costing.foodCostPercent)}
                                  </div>
                                </div>

                                <div className="rounded-xl border bg-white p-4">
                                  <div className="text-xs text-slate-500">Gross Profit</div>
                                  <div className="mt-1 text-lg font-semibold text-slate-900">
                                    {money(costing.grossProfit)}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {percent(costing.grossMarginPercent)}
                                  </div>
                                </div>

                                {costing.labourCostingEnabled ? (
                                  <div className="rounded-xl border bg-white p-4">
                                    <div className="text-xs text-slate-500">Labour</div>
                                    <div className="mt-1 text-lg font-semibold text-slate-900">
                                      {money(costing.labourCost)}
                                    </div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {costing.totalLabourMinutes === null
                                        ? 'Confirm dish and prep times'
                                        : `${minuteLabel(costing.totalLabourMinutes)} total`}
                                    </div>
                                  </div>
                                ) : null}

                                {costing.labourCostingEnabled ? (
                                  <div className="rounded-xl border bg-white p-4">
                                    <div className="text-xs text-slate-500">
                                      Contribution After Labour
                                    </div>
                                    <div className="mt-1 text-lg font-semibold text-slate-900">
                                      {money(costing.contributionAfterLabour)}
                                    </div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {percent(costing.contributionAfterLabourPercent)}
                                    </div>
                                  </div>
                                ) : null}
                              </div>

                              {costing.missingCostCount > 0 ? (
                                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                  This costing is estimated. {costing.missingCostCount} cost input(s)
                                  are missing, usually supplier prices or L2 batch output.
                                </div>
                              ) : costing.labourCostingEnabled && costing.missingLabourCount > 0 ? (
                                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                  Food costing is complete. Confirm the L1 service time and all
                                  consumed L2 prep times to calculate labour.
                                </div>
                              ) : (
                                <div className="mt-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
                                  Costing complete. All required prices, outputs, and enabled labour
                                  times are confirmed.
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
          L0 menus are built from L1 dishes. L1 food cost uses direct L1 → L3 rows plus L1 → L2
          prep components expanded through L2 → L3.
        </div>
      </div>
    </main>
  )
}
