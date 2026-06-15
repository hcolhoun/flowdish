'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { readImageTextWithTesseract } from '@/lib/browser-ocr'

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

type ParsedSalesRow = {
  sourceCode: string | null
  sourceName: string
  qty: number | null
  matchedItemId: string | null
  matchedItemSku: string | null
  matchedItemName: string | null
  confidence: number
  matchReason: string
  notes: string | null
  needsReview: boolean
}

type ParsedSalesModifierRow = {
  sourceCode: string | null
  sourceName: string
  modifierType: 'EXTRA' | 'REMOVE'
  qty: number | null
  matchedItemId: string | null
  matchedItemSku: string | null
  matchedItemName: string | null
  matchedItemType: 'L1' | 'L2' | 'L3' | null
  matchedItemUnitType: 'g' | 'ml' | 'each' | null
  confidence: number
  matchReason: string
  notes: string | null
  needsReview: boolean
}

type ParsedSalesResponse = {
  salesDate: string | null
  rows: ParsedSalesRow[]
  modifierRows?: ParsedSalesModifierRow[]
}

type SalesReviewRow = {
  rowId: string
  selected: boolean
  sourceCode: string
  sourceName: string
  qty: string
  itemId: string
  confidence: number
  matchReason: string
  notes: string
  needsReview: boolean
}

type ModifierReviewRow = {
  rowId: string
  selected: boolean
  sourceCode: string
  sourceName: string
  modifierType: 'EXTRA' | 'REMOVE'
  qty: string
  itemId: string
  confidence: number
  matchReason: string
  notes: string
  needsReview: boolean
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
  const router = useRouter()
  const [items, setItems] = useState<Item[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [itemId, setItemId] = useState('')
  const [soldAt, setSoldAt] = useState('')
  const [qty, setQty] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [pasteText, setPasteText] = useState('')
  const [ocrProgress, setOcrProgress] = useState('')
  const [parsingImport, setParsingImport] = useState(false)
  const [savingImport, setSavingImport] = useState(false)
  const [salesReviewRows, setSalesReviewRows] = useState<SalesReviewRow[]>([])
  const [modifierReviewRows, setModifierReviewRows] = useState<ModifierReviewRow[]>([])

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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

  function toInputValue(value: string | number | null | undefined) {
    if (value === null || value === undefined) return ''
    return String(value)
  }

  function money(value: number | null | undefined, maximumFractionDigits = 2) {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits,
    }).format(value ?? 0)
  }

  function convertSalesToForecast() {
    const rows = summary.itemRows
      .filter((row) => row.itemId && Number(row.qty) > 0)
      .map((row) => ({
        itemId: row.itemId,
        qty: String(row.qty),
      }))

    if (rows.length === 0) {
      setError('There are no sold dishes in this timeframe to convert.')
      return
    }

    window.localStorage.setItem(
      'flowdish:sales-to-forecast',
      JSON.stringify({
        name: 'Forecast from sales',
        lines: rows,
      })
    )

    router.push('/planning')
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

      setItems(itemsData.filter((item: Item) => ['L1', 'L2', 'L3'].includes(item.itemType)))
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

  function updateReviewRow(rowId: string, updates: Partial<SalesReviewRow>) {
    setSalesReviewRows((rows) =>
      rows.map((row) => (row.rowId === rowId ? { ...row, ...updates } : row))
    )
  }

  function updateModifierReviewRow(rowId: string, updates: Partial<ModifierReviewRow>) {
    setModifierReviewRows((rows) =>
      rows.map((row) => (row.rowId === rowId ? { ...row, ...updates } : row))
    )
  }

  const l1Items = useMemo(() => items.filter((item) => item.itemType === 'L1'), [items])
  const modifierItems = useMemo(
    () => items.filter((item) => item.itemType === 'L1' || item.itemType === 'L2' || item.itemType === 'L3'),
    [items]
  )

  async function parseSalesImport() {
    try {
      setError('')
      setMessage('')
      setSalesReviewRows([])
      setModifierReviewRows([])
      setParsingImport(true)

      let res: Response
      const directUploadLimit = 4 * 1024 * 1024

      if (pasteText.trim()) {
        res = await fetch('/api/parse-sales-zread', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pastedText: pasteText }),
        })
      } else if (importFile?.type.startsWith('image/')) {
        const ocrText = await readImageTextWithTesseract(importFile, setOcrProgress)
        setOcrProgress('Structuring sales...')
        res = await fetch('/api/parse-sales-zread', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ocrText, sourceFileName: importFile.name }),
        })
      } else if (importFile) {
        if (importFile.size > directUploadLimit) {
          throw new Error('This file is too large to upload directly. Use a smaller text file or take a photo.')
        }

        const formData = new FormData()
        formData.append('file', importFile)
        res = await fetch('/api/parse-sales-zread', {
          method: 'POST',
          body: formData,
        })
      } else {
        throw new Error('Choose a Z-read file or paste text first.')
      }

      const data = (await safeJson(res)) as ParsedSalesResponse & { error?: string }

      if (!res.ok) throw new Error(data?.error || 'Failed to parse sales import')

      if (data.salesDate) setSoldAt(data.salesDate)

      const mappedRows = (data.rows || []).map((row, index) => ({
        rowId: `${Date.now()}-${index}`,
        selected: true,
        sourceCode: row.sourceCode || '',
        sourceName: row.sourceName || '',
        qty: toInputValue(row.qty),
        itemId: row.matchedItemId || '',
        confidence: row.confidence || 0,
        matchReason: row.matchReason || '',
        notes: row.notes || '',
        needsReview: Boolean(row.needsReview),
      }))
      const mappedModifierRows = (data.modifierRows || []).map((row, index) => ({
        rowId: `${Date.now()}-modifier-${index}`,
        selected: true,
        sourceCode: row.sourceCode || '',
        sourceName: row.sourceName || '',
        modifierType: row.modifierType === 'REMOVE' ? 'REMOVE' as const : 'EXTRA' as const,
        qty: toInputValue(row.qty),
        itemId: row.matchedItemId || '',
        confidence: row.confidence || 0,
        matchReason: row.matchReason || '',
        notes: row.notes || '',
        needsReview: Boolean(row.needsReview),
      }))

      setSalesReviewRows(mappedRows)
      setModifierReviewRows(mappedModifierRows)
      setMessage(
        `Sales import parsed. ${mappedRows.length} sales row(s) and ${mappedModifierRows.length} modifier row(s) found. Review before saving.`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setParsingImport(false)
      setOcrProgress('')
    }
  }

  async function saveSalesImport() {
    try {
      setError('')
      setMessage('')
      setSavingImport(true)

      const rowsToSave = salesReviewRows.filter((row) => row.selected)
      const modifiersToSave = modifierReviewRows.filter((row) => row.selected)

      if (rowsToSave.length === 0 && modifiersToSave.length === 0) {
        throw new Error('No sales or modifier rows selected to save.')
      }

      const invalidRows = rowsToSave.filter(
        (row) => !row.itemId || !row.qty || Number(row.qty) <= 0
      )

      if (invalidRows.length > 0) {
        throw new Error(`${invalidRows.length} selected row(s) need an L1 item and quantity.`)
      }

      const invalidModifiers = modifiersToSave.filter(
        (row) => !row.itemId || !row.qty || Number(row.qty) <= 0
      )

      if (invalidModifiers.length > 0) {
        throw new Error(`${invalidModifiers.length} selected modifier row(s) need an item and quantity.`)
      }

      const res = await fetch('/api/sales/import/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          soldAt,
          rows: rowsToSave.map((row) => ({
            itemId: row.itemId,
            qty: Number(row.qty),
            selected: row.selected,
          })),
          modifierRows: modifiersToSave.map((row) => ({
            itemId: row.itemId,
            qty: Number(row.qty),
            modifierType: row.modifierType,
            sourceCode: row.sourceCode,
            sourceName: row.sourceName,
            notes: row.notes,
            selected: row.selected,
          })),
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) throw new Error(data?.error || 'Failed to save imported sales')

      setMessage(
        `${data.savedCount ?? rowsToSave.length} imported sale row(s) and ${
          data.savedModifierCount ?? modifiersToSave.length
        } modifier row(s) saved.`
      )
      setSalesReviewRows([])
      setModifierReviewRows([])
      setImportFile(null)
      setPasteText('')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSavingImport(false)
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

        <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Import Z-Read / POS Report</h2>
          <p className="mt-2 text-sm text-slate-700">
            Take a photo, upload a text-style file, or paste text. Review matched L1 sales before
            stock is consumed.
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Selected report
              </label>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  setImportFile(e.target.files?.[0] ?? null)
                  setPasteText('')
                  setSalesReviewRows([])
                  setModifierReviewRows([])
                  setError('')
                  setMessage('')
                }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.txt,.csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  setImportFile(e.target.files?.[0] ?? null)
                  setPasteText('')
                  setSalesReviewRows([])
                  setModifierReviewRows([])
                  setError('')
                  setMessage('')
                }}
              />
              <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {importFile ? importFile.name : 'No report selected'}
              </div>
              {ocrProgress ? <div className="mt-2 text-sm text-slate-600">{ocrProgress}</div> : null}
            </div>

            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={parsingImport || savingImport}
              className="rounded-xl border px-5 py-3 text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Take Photo
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsingImport || savingImport}
              className="rounded-xl border px-5 py-3 text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Upload File
            </button>

            <button
              type="button"
              onClick={parseSalesImport}
              disabled={parsingImport || savingImport}
              className="rounded-xl bg-slate-900 px-5 py-3 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {parsingImport ? 'Parsing...' : 'Parse Sales'}
            </button>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-slate-900">Paste Text</label>
            <textarea
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value)
                setImportFile(null)
                setSalesReviewRows([])
                setModifierReviewRows([])
              }}
              className="h-28 w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Paste POS/Z-read text here"
            />
          </div>

          {salesReviewRows.length > 0 || modifierReviewRows.length > 0 ? (
            <div className="mt-6 overflow-hidden rounded-xl border">
              {salesReviewRows.length > 0 ? (
                <div>
                  <div className="border-b bg-slate-50 px-6 py-3">
                    <h3 className="font-semibold text-slate-900">L1 Sales Review</h3>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-[1050px] w-full text-left text-sm">
                      <thead className="bg-slate-100 text-slate-700">
                        <tr>
                          <th className="px-4 py-3">Use</th>
                          <th className="px-4 py-3">Code</th>
                          <th className="px-4 py-3">Source Item</th>
                          <th className="px-4 py-3">L1 Match</th>
                          <th className="px-4 py-3">Qty</th>
                          <th className="px-4 py-3">Match</th>
                          <th className="px-4 py-3">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salesReviewRows.map((row) => {
                          const rowNeedsReview = row.needsReview || !row.itemId

                          return (
                            <tr
                              key={row.rowId}
                              className={`border-t align-top ${rowNeedsReview ? 'bg-amber-50' : ''}`}
                            >
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={row.selected}
                                  onChange={(e) =>
                                    updateReviewRow(row.rowId, { selected: e.target.checked })
                                  }
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  value={row.sourceCode}
                                  onChange={(e) =>
                                    updateReviewRow(row.rowId, { sourceCode: e.target.value })
                                  }
                                  className="w-28 rounded-lg border px-2 py-1 text-sm"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  value={row.sourceName}
                                  onChange={(e) =>
                                    updateReviewRow(row.rowId, { sourceName: e.target.value })
                                  }
                                  className="w-56 rounded-lg border px-2 py-1 text-sm"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <select
                                  value={row.itemId}
                                  onChange={(e) => updateReviewRow(row.rowId, { itemId: e.target.value })}
                                  className="w-64 rounded-lg border px-2 py-1 text-sm"
                                >
                                  <option value="">Select L1 item</option>
                                  {l1Items.map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.name} [{item.sku}]
                                    </option>
                                  ))}
                                </select>
                                {rowNeedsReview ? (
                                  <div className="mt-1 text-xs font-medium text-amber-800">
                                    Needs L1 match/review
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  step="1"
                                  value={row.qty}
                                  onChange={(e) => updateReviewRow(row.rowId, { qty: e.target.value })}
                                  className="w-24 rounded-lg border px-2 py-1 text-sm"
                                />
                              </td>
                              <td className="px-4 py-3 text-slate-700">
                                <div>{Math.round((row.confidence || 0) * 100)}%</div>
                                <div className={rowNeedsReview ? 'text-xs font-medium text-amber-800' : 'text-xs text-slate-500'}>
                                  {row.matchReason}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <textarea
                                  value={row.notes}
                                  onChange={(e) =>
                                    updateReviewRow(row.rowId, { notes: e.target.value })
                                  }
                                  className="h-16 w-52 rounded-lg border px-2 py-1 text-sm"
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {modifierReviewRows.length > 0 ? (
                <div className={salesReviewRows.length > 0 ? 'border-t' : ''}>
                  <div className="border-b bg-blue-50 px-6 py-3">
                    <h3 className="font-semibold text-slate-900">Extras / Subtractions Review</h3>
                    <p className="mt-1 text-xs text-slate-600">
                      Review POS modifiers separately before stock is adjusted.
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-[1120px] w-full text-left text-sm">
                      <thead className="bg-slate-100 text-slate-700">
                        <tr>
                          <th className="px-4 py-3">Use</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3">Code</th>
                          <th className="px-4 py-3">Source Modifier</th>
                          <th className="px-4 py-3">Flowdish Item</th>
                          <th className="px-4 py-3">Qty</th>
                          <th className="px-4 py-3">Match</th>
                          <th className="px-4 py-3">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modifierReviewRows.map((row) => {
                          const rowNeedsReview = row.needsReview || !row.itemId

                          return (
                            <tr
                              key={row.rowId}
                              className={`border-t align-top ${rowNeedsReview ? 'bg-amber-50' : ''}`}
                            >
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={row.selected}
                                  onChange={(e) =>
                                    updateModifierReviewRow(row.rowId, { selected: e.target.checked })
                                  }
                                />
                              </td>
                              <td className="px-4 py-3">
                                <select
                                  value={row.modifierType}
                                  onChange={(e) =>
                                    updateModifierReviewRow(row.rowId, {
                                      modifierType: e.target.value === 'REMOVE' ? 'REMOVE' : 'EXTRA',
                                    })
                                  }
                                  className="w-28 rounded-lg border px-2 py-1 text-sm"
                                >
                                  <option value="EXTRA">Extra</option>
                                  <option value="REMOVE">Remove</option>
                                </select>
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  value={row.sourceCode}
                                  onChange={(e) =>
                                    updateModifierReviewRow(row.rowId, { sourceCode: e.target.value })
                                  }
                                  className="w-28 rounded-lg border px-2 py-1 text-sm"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  value={row.sourceName}
                                  onChange={(e) =>
                                    updateModifierReviewRow(row.rowId, { sourceName: e.target.value })
                                  }
                                  className="w-56 rounded-lg border px-2 py-1 text-sm"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <select
                                  value={row.itemId}
                                  onChange={(e) =>
                                    updateModifierReviewRow(row.rowId, { itemId: e.target.value })
                                  }
                                  className="w-72 rounded-lg border px-2 py-1 text-sm"
                                >
                                  <option value="">Select L1/L2/L3 item</option>
                                  {modifierItems.map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.name} [{item.sku}] - {item.itemType} / {item.unitType}
                                    </option>
                                  ))}
                                </select>
                                {rowNeedsReview ? (
                                  <div className="mt-1 text-xs font-medium text-amber-800">
                                    Needs item match/review
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  step="0.001"
                                  value={row.qty}
                                  onChange={(e) =>
                                    updateModifierReviewRow(row.rowId, { qty: e.target.value })
                                  }
                                  className="w-24 rounded-lg border px-2 py-1 text-sm"
                                />
                              </td>
                              <td className="px-4 py-3 text-slate-700">
                                <div>{Math.round((row.confidence || 0) * 100)}%</div>
                                <div className={rowNeedsReview ? 'text-xs font-medium text-amber-800' : 'text-xs text-slate-500'}>
                                  {row.matchReason}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <textarea
                                  value={row.notes}
                                  onChange={(e) =>
                                    updateModifierReviewRow(row.rowId, { notes: e.target.value })
                                  }
                                  className="h-16 w-52 rounded-lg border px-2 py-1 text-sm"
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3 border-t px-6 py-4">
                <button
                  type="button"
                  onClick={saveSalesImport}
                  disabled={savingImport || parsingImport}
                  className="rounded-xl bg-green-700 px-5 py-3 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {savingImport ? 'Saving...' : 'Save Reviewed Sales'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSalesReviewRows([])
                    setModifierReviewRows([])
                  }}
                  disabled={savingImport}
                  className="rounded-xl border px-5 py-3 text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  Discard Review
                </button>

                <div className="text-sm text-slate-600">
                  Selected rows:{' '}
                  {salesReviewRows.filter((row) => row.selected).length +
                    modifierReviewRows.filter((row) => row.selected).length}
                </div>
              </div>
            </div>
          ) : null}
        </section>

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
              {l1Items.map((item) => (
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
          <div className="flex flex-col gap-4 border-b px-6 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Sales by Dish</h2>
              <p className="mt-1 text-sm text-slate-700">
                Ranked by quantity sold in the selected timeframe.
              </p>
            </div>

            <button
              type="button"
              onClick={convertSalesToForecast}
              disabled={summary.itemRows.length === 0}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Convert to Forecast
            </button>
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
