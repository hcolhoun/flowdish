'use client'

import { useEffect, useMemo, useState } from 'react'

type UnitType = 'g' | 'ml' | 'each'

type Item = {
  id: string
  sku: string
  name: string
  itemType: 'L1' | 'L2' | 'L3'
  unitType: UnitType
  shelfLifeDays: number | null
  standardBatchOutput: number | null
}

type PrepHaccpRecord = {
  id: string
  cookingEnabled: boolean
  cookingFinishedAt: string | null
  cookingCoreTempC: number | null
  coolingEnabled: boolean
  coolingIntoFridgeAt: string | null
  reheatingEnabled: boolean
  reheatingCoreTempC: number | null
  hotHoldEnabled: boolean
  hotHoldStartedAt: string | null
  hotHoldCoreTemp1C: number | null
  hotHoldCoreTemp2C: number | null
  hotHoldCoreTemp3C: number | null
  updatedAt: string
}

type PrepBatch = {
  id: string
  preparedAt: string
  qtyOutput: number
  expiryAt: string | null
  createdAt?: string | null
  enteredByName?: string | null
  enteredByType?: string | null
  item: Item
  haccpRecord?: PrepHaccpRecord | null
}

type HaccpForm = {
  cookingEnabled: boolean
  cookingFinishedAt: string
  cookingCoreTempC: string
  coolingEnabled: boolean
  coolingIntoFridgeAt: string
  reheatingEnabled: boolean
  reheatingCoreTempC: string
  hotHoldEnabled: boolean
  hotHoldStartedAt: string
  hotHoldCoreTemp1C: string
  hotHoldCoreTemp2C: string
  hotHoldCoreTemp3C: string
}

type EditingPrep = {
  preparedAt: string
  qtyOutput: string
  expiryAt: string
  haccpRecord: HaccpForm
}

function toDateInputValue(value: string | Date | null | undefined) {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 10)
}

function toTimeInputValue(value: string | Date | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return offsetDate.toISOString().slice(11, 16)
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function addDaysToInputDate(dateValue: string, days: number | null) {
  if (!dateValue || days === null || days === undefined) return ''
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return ''
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function emptyHaccpForm(): HaccpForm {
  return {
    cookingEnabled: false,
    cookingFinishedAt: '',
    cookingCoreTempC: '',
    coolingEnabled: false,
    coolingIntoFridgeAt: '',
    reheatingEnabled: false,
    reheatingCoreTempC: '',
    hotHoldEnabled: false,
    hotHoldStartedAt: '',
    hotHoldCoreTemp1C: '',
    hotHoldCoreTemp2C: '',
    hotHoldCoreTemp3C: '',
  }
}

function haccpFormFromRecord(record: PrepHaccpRecord | null | undefined): HaccpForm {
  return {
    cookingEnabled: Boolean(record?.cookingEnabled),
    cookingFinishedAt: toTimeInputValue(record?.cookingFinishedAt),
    cookingCoreTempC: record?.cookingCoreTempC != null ? String(record.cookingCoreTempC) : '',
    coolingEnabled: Boolean(record?.coolingEnabled),
    coolingIntoFridgeAt: toTimeInputValue(record?.coolingIntoFridgeAt),
    reheatingEnabled: Boolean(record?.reheatingEnabled),
    reheatingCoreTempC: record?.reheatingCoreTempC != null ? String(record.reheatingCoreTempC) : '',
    hotHoldEnabled: Boolean(record?.hotHoldEnabled),
    hotHoldStartedAt: toTimeInputValue(record?.hotHoldStartedAt),
    hotHoldCoreTemp1C: record?.hotHoldCoreTemp1C != null ? String(record.hotHoldCoreTemp1C) : '',
    hotHoldCoreTemp2C: record?.hotHoldCoreTemp2C != null ? String(record.hotHoldCoreTemp2C) : '',
    hotHoldCoreTemp3C: record?.hotHoldCoreTemp3C != null ? String(record.hotHoldCoreTemp3C) : '',
  }
}

function combineDateAndTime(dateValue: string, timeValue: string) {
  if (!dateValue || !timeValue) return null
  return `${dateValue}T${timeValue}:00`
}

function numberOrNull(value: string) {
  return value === '' ? null : Number(value)
}

function haccpPayloadFromForm(form: HaccpForm, prepDate: string) {
  return {
    cookingEnabled: form.cookingEnabled,
    cookingFinishedAt: form.cookingEnabled
      ? combineDateAndTime(prepDate, form.cookingFinishedAt)
      : null,
    cookingCoreTempC: form.cookingEnabled ? numberOrNull(form.cookingCoreTempC) : null,
    coolingEnabled: form.coolingEnabled,
    coolingIntoFridgeAt: form.coolingEnabled
      ? combineDateAndTime(prepDate, form.coolingIntoFridgeAt)
      : null,
    reheatingEnabled: form.reheatingEnabled,
    reheatingCoreTempC: form.reheatingEnabled ? numberOrNull(form.reheatingCoreTempC) : null,
    hotHoldEnabled: form.hotHoldEnabled,
    hotHoldStartedAt: form.hotHoldEnabled
      ? combineDateAndTime(prepDate, form.hotHoldStartedAt)
      : null,
    hotHoldCoreTemp1C: form.hotHoldEnabled ? numberOrNull(form.hotHoldCoreTemp1C) : null,
    hotHoldCoreTemp2C: form.hotHoldEnabled ? numberOrNull(form.hotHoldCoreTemp2C) : null,
    hotHoldCoreTemp3C: form.hotHoldEnabled ? numberOrNull(form.hotHoldCoreTemp3C) : null,
  }
}

function HaccpChecksPanel({
  form,
  onChange,
  auditName,
}: {
  form: HaccpForm
  onChange: (field: keyof HaccpForm, value: string | boolean) => void
  auditName?: string
}) {
  function auditTrailName() {
    return auditName ? (
      <div className="mt-1 text-xs text-slate-500">{auditName}</div>
    ) : null
  }

  return (
    <section className="md:col-span-2">
      <div className="rounded-xl border bg-slate-50 p-4">
        <h3 className="text-sm font-semibold text-slate-900">Add HACCP Checks</h3>

        <div className="mt-3 grid gap-2">
          {[
            ['cookingEnabled', 'Cooking'],
            ['coolingEnabled', 'Cooling'],
            ['reheatingEnabled', 'Reheating'],
            ['hotHoldEnabled', 'Hot Hold'],
          ].map(([field, label]) => (
            <label
              key={field}
              className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-800"
            >
              <input
                type="checkbox"
                checked={Boolean(form[field as keyof HaccpForm])}
                onChange={(e) => onChange(field as keyof HaccpForm, e.target.checked)}
                className="h-4 w-4"
              />
              {label}
            </label>
          ))}
        </div>

        {form.cookingEnabled ? (
          <div className="mt-4 grid gap-3 rounded-lg border bg-white p-4">
            <h4 className="text-sm font-semibold text-slate-900">Cooking</h4>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Time Finished Cooking
              </label>
              <input
                type="time"
                value={form.cookingFinishedAt}
                onChange={(e) => onChange('cookingFinishedAt', e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
              />
              {auditTrailName()}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Core Temp (C)
              </label>
              <input
                type="number"
                step="0.1"
                value={form.cookingCoreTempC}
                onChange={(e) => onChange('cookingCoreTempC', e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
              />
              {auditTrailName()}
            </div>
          </div>
        ) : null}

        {form.coolingEnabled ? (
          <div className="mt-4 grid gap-3 rounded-lg border bg-white p-4">
            <h4 className="text-sm font-semibold text-slate-900">Cooling</h4>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Time Into Fridge/Blast Chiller
              </label>
              <input
                type="time"
                value={form.coolingIntoFridgeAt}
                onChange={(e) => onChange('coolingIntoFridgeAt', e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
              />
              {auditTrailName()}
            </div>
          </div>
        ) : null}

        {form.reheatingEnabled ? (
          <div className="mt-4 grid gap-3 rounded-lg border bg-white p-4">
            <h4 className="text-sm font-semibold text-slate-900">Reheating</h4>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Core Temp (C)
              </label>
              <input
                type="number"
                step="0.1"
                value={form.reheatingCoreTempC}
                onChange={(e) => onChange('reheatingCoreTempC', e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
              />
              {auditTrailName()}
            </div>
          </div>
        ) : null}

        {form.hotHoldEnabled ? (
          <div className="mt-4 grid gap-3 rounded-lg border bg-white p-4">
            <h4 className="text-sm font-semibold text-slate-900">
              Hot Hold Display Records
            </h4>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Time Into Hot Hold
              </label>
              <input
                type="time"
                value={form.hotHoldStartedAt}
                onChange={(e) => onChange('hotHoldStartedAt', e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
              />
              {auditTrailName()}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Core Temp 1st Check (C)
              </label>
              <input
                type="number"
                step="0.1"
                value={form.hotHoldCoreTemp1C}
                onChange={(e) => onChange('hotHoldCoreTemp1C', e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
              />
              {auditTrailName()}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Core Temp 2nd Check (C)
              </label>
              <input
                type="number"
                step="0.1"
                value={form.hotHoldCoreTemp2C}
                onChange={(e) => onChange('hotHoldCoreTemp2C', e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
              />
              {auditTrailName()}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Core Temp 3rd Check (C)
              </label>
              <input
                type="number"
                step="0.1"
                value={form.hotHoldCoreTemp3C}
                onChange={(e) => onChange('hotHoldCoreTemp3C', e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
              />
              {auditTrailName()}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default function PrepPage() {
  const [items, setItems] = useState<Item[]>([])
  const [prepBatches, setPrepBatches] = useState<PrepBatch[]>([])
  const [itemId, setItemId] = useState('')
  const [preparedAt, setPreparedAt] = useState('')
  const [qtyOutput, setQtyOutput] = useState('')
  const [expiryAt, setExpiryAt] = useState('')
  const [haccpRecord, setHaccpRecord] = useState<HaccpForm>(emptyHaccpForm)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingPrep, setEditingPrep] = useState<EditingPrep | null>(null)

  const selectedItem = useMemo(
    () => items.find((item) => item.id === itemId) ?? null,
    [items, itemId]
  )

  async function safeJson(res: Response) {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 500))
    }
  }

  function formatDate(value: string | null) {
    if (!value) return ''
    return new Date(value).toLocaleDateString('en-GB')
  }

  function formatDateTime(value: string | null | undefined) {
    if (!value) return ''

    return new Date(value).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function enteredByLabel(batch: PrepBatch) {
    const name = batch.enteredByName || 'Unknown'
    const date = formatDateTime(batch.createdAt)

    return date ? `${name} - ${date}` : name
  }

  function auditName(batch: PrepBatch) {
    return batch.enteredByName || 'Unknown'
  }

  function formatQty(value: number) {
    return Number.isInteger(value) ? String(value) : value.toFixed(3)
  }

  function haccpSummary(record: PrepHaccpRecord | null | undefined) {
    if (!record) return 'None'

    const fields = [
      record.cookingEnabled ? 'Cooking ✓' : '',
      record.coolingEnabled ? 'Cooling ✓' : '',
      record.reheatingEnabled ? 'Reheating ✓' : '',
      record.hotHoldEnabled ? 'Hot Hold ✓' : '',
    ].filter(Boolean)

    return fields.length > 0 ? fields.join('  ') : 'None'
  }

  function haccpSummaryStack(record: PrepHaccpRecord | null | undefined, batch: PrepBatch) {
    if (!record) return <span>None</span>

    const entries = [
      record.cookingEnabled && record.cookingFinishedAt
        ? `Cooking time: ${formatDateTime(record.cookingFinishedAt)}`
        : '',
      record.cookingEnabled && record.cookingCoreTempC != null
        ? `Cooking core temp: ${formatQty(record.cookingCoreTempC)} C`
        : '',
      record.coolingEnabled && record.coolingIntoFridgeAt
        ? `Cooling into fridge: ${formatDateTime(record.coolingIntoFridgeAt)}`
        : '',
      record.reheatingEnabled && record.reheatingCoreTempC != null
        ? `Reheating core temp: ${formatQty(record.reheatingCoreTempC)} C`
        : '',
      record.hotHoldEnabled && record.hotHoldStartedAt
        ? `Hot hold time: ${formatDateTime(record.hotHoldStartedAt)}`
        : '',
      record.hotHoldEnabled && record.hotHoldCoreTemp1C != null
        ? `Hot hold core temp 1: ${formatQty(record.hotHoldCoreTemp1C)} C`
        : '',
      record.hotHoldEnabled && record.hotHoldCoreTemp2C != null
        ? `Hot hold core temp 2: ${formatQty(record.hotHoldCoreTemp2C)} C`
        : '',
      record.hotHoldEnabled && record.hotHoldCoreTemp3C != null
        ? `Hot hold core temp 3: ${formatQty(record.hotHoldCoreTemp3C)} C`
        : '',
    ].filter(Boolean)

    if (entries.length === 0) return <span>None</span>

    return (
      <div className="grid gap-1">
        {entries.map((entry) => (
          <div key={entry}>
            <div>{entry}</div>
            <div className="text-xs text-slate-500">{auditName(batch)}</div>
          </div>
        ))}
      </div>
    )
  }

  function updateNewHaccp(field: keyof HaccpForm, value: string | boolean) {
    setHaccpRecord((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function updateEditingHaccp(field: keyof HaccpForm, value: string | boolean) {
    if (!editingPrep) return

    setEditingPrep({
      ...editingPrep,
      haccpRecord: {
        ...editingPrep.haccpRecord,
        [field]: value,
      },
    })
  }

  async function loadData() {
    try {
      setError('')

      const [itemsRes, prepRes] = await Promise.all([
        fetch('/api/items', { cache: 'no-store' }),
        fetch('/api/prep', { cache: 'no-store' }),
      ])

      const itemsData = await safeJson(itemsRes)
      const prepData = await safeJson(prepRes)

      if (!itemsRes.ok) {
        throw new Error(itemsData?.error || 'Failed to load items')
      }

      if (!prepRes.ok) {
        throw new Error(prepData?.error || 'Failed to load prep batches')
      }

      setItems(itemsData.filter((item: Item) => item.itemType === 'L2'))
      setPrepBatches(prepData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    const today = todayInputValue()
    setPreparedAt(today)
    loadData()
  }, [])

  useEffect(() => {
    if (!selectedItem || !preparedAt) {
      setExpiryAt('')
      return
    }

    setExpiryAt(addDaysToInputDate(preparedAt, selectedItem.shelfLifeDays))
  }, [selectedItem?.id, preparedAt])

  function startEditPrep(batch: PrepBatch) {
    setEditingId(batch.id)
    setEditingPrep({
      preparedAt: toDateInputValue(batch.preparedAt),
      qtyOutput: String(batch.qtyOutput),
      expiryAt: toDateInputValue(batch.expiryAt),
      haccpRecord: haccpFormFromRecord(batch.haccpRecord),
    })
    setError('')
    setMessage('')
  }

  function cancelEditPrep() {
    setEditingId(null)
    setEditingPrep(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    try {
      setSaving(true)
      setError('')
      setMessage('')

      const res = await fetch('/api/prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          preparedAt,
          qtyOutput: Number(qtyOutput),
          expiryAt: expiryAt || null,
          haccpRecord: haccpPayloadFromForm(haccpRecord, preparedAt),
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save prep batch')
      }

      const today = todayInputValue()
      setItemId('')
      setPreparedAt(today)
      setQtyOutput('')
      setExpiryAt('')
      setHaccpRecord(emptyHaccpForm())
      setMessage('Prep batch saved.')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  async function savePrepEdit(batch: PrepBatch) {
    if (!editingPrep) return

    try {
      setSaving(true)
      setError('')
      setMessage('')

      const res = await fetch('/api/prep', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: batch.id,
          preparedAt: editingPrep.preparedAt,
          qtyOutput: Number(editingPrep.qtyOutput),
          expiryAt: editingPrep.expiryAt || null,
          haccpRecord: haccpPayloadFromForm(editingPrep.haccpRecord, editingPrep.preparedAt),
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to update prep batch')
      }

      setMessage('Prep batch updated.')
      cancelEditPrep()
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-semibold text-slate-900">Prep</h1>

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
            <h2 className="text-xl font-semibold text-slate-900">New Prep Batch</h2>
            <p className="mt-1 text-sm text-slate-600">
              The expiry date defaults from the L2 shelf life, but can be changed before saving.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">L2 Item</label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            >
              <option value="">Select prep item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} [{item.sku}]
                </option>
              ))}
            </select>

            {selectedItem ? (
              <p className="mt-2 text-sm text-slate-600">
                Unit: {selectedItem.unitType} - Shelf life:{' '}
                {selectedItem.shelfLifeDays ?? 'N/A'} days - Std batch:{' '}
                {selectedItem.standardBatchOutput ?? 'N/A'}
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">Prepared At</label>
            <input
              type="date"
              value={preparedAt}
              onChange={(e) => setPreparedAt(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              Output Quantity {selectedItem ? `(${selectedItem.unitType})` : ''}
            </label>
            <input
              type="number"
              step="0.001"
              value={qtyOutput}
              onChange={(e) => setQtyOutput(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">Expiry Date</label>
            <input
              type="date"
              value={expiryAt}
              onChange={(e) => setExpiryAt(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
            />
          </div>

          <HaccpChecksPanel form={haccpRecord} onChange={updateNewHaccp} />

          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {saving ? 'Saving...' : 'Save Prep Batch'}
            </button>
          </div>
        </form>

        <div className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead className="bg-slate-100 text-sm">
              <tr>
                <th className="px-4 py-3 text-slate-800">Date</th>
                <th className="px-4 py-3 text-slate-800">Item</th>
                <th className="px-4 py-3 text-slate-800">Qty Output</th>
                <th className="px-4 py-3 text-slate-800">Unit</th>
                <th className="px-4 py-3 text-slate-800">Expiry</th>
                <th className="px-4 py-3 text-slate-800">HACCP</th>
                <th className="px-4 py-3 text-slate-800">Entered</th>
                <th className="sticky right-0 z-10 bg-slate-100 px-4 py-3 text-slate-800">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {prepBatches.length === 0 ? (
                <tr className="border-t">
                  <td className="px-4 py-3 text-slate-700" colSpan={8}>
                    No prep batches yet.
                  </td>
                </tr>
              ) : (
                prepBatches.map((batch) => {
                  const isEditing = editingId === batch.id && editingPrep

                  return (
                    <tr key={batch.id} className="border-t align-top">
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="date"
                            value={editingPrep.preparedAt}
                            onChange={(e) =>
                              setEditingPrep({
                                ...editingPrep,
                                preparedAt: e.target.value,
                              })
                            }
                            className="rounded-lg border px-2 py-1 text-sm"
                          />
                        ) : (
                          formatDate(batch.preparedAt)
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {batch.item.name} [{batch.item.sku}]
                      </td>

                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.001"
                            value={editingPrep.qtyOutput}
                            onChange={(e) =>
                              setEditingPrep({
                                ...editingPrep,
                                qtyOutput: e.target.value,
                              })
                            }
                            className="w-28 rounded-lg border px-2 py-1 text-sm"
                          />
                        ) : (
                          formatQty(batch.qtyOutput)
                        )}
                      </td>

                      <td className="px-4 py-3">{batch.item.unitType}</td>

                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="date"
                            value={editingPrep.expiryAt}
                            onChange={(e) =>
                              setEditingPrep({
                                ...editingPrep,
                                expiryAt: e.target.value,
                              })
                            }
                            className="rounded-lg border px-2 py-1 text-sm"
                          />
                        ) : (
                          formatDate(batch.expiryAt)
                        )}
                      </td>

                      <td className="min-w-80 max-w-md px-4 py-3">
                        {isEditing ? (
                          <HaccpChecksPanel
                            form={editingPrep.haccpRecord}
                            onChange={updateEditingHaccp}
                            auditName={auditName(batch)}
                          />
                        ) : (
                          <div className="text-sm text-slate-700">
                            {haccpSummaryStack(batch.haccpRecord, batch)}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-xs text-slate-500">{enteredByLabel(batch)}</div>
                      </td>

                      <td className="sticky right-0 bg-white px-4 py-3 shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)]">
                        <div className="flex min-w-24 flex-col gap-2">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => savePrepEdit(batch)}
                                disabled={saving}
                                className="rounded-lg border border-green-300 px-3 py-1 text-sm text-green-700 hover:bg-green-50 disabled:opacity-60"
                              >
                                Save
                              </button>

                              <button
                                type="button"
                                onClick={cancelEditPrep}
                                disabled={saving}
                                className="rounded-lg border px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditPrep(batch)}
                              className="rounded-lg border px-3 py-1 text-sm text-slate-800 hover:bg-slate-50"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Editing a prep batch is only allowed while the produced L2 stock has not been used.
        </div>
      </div>
    </main>
  )
}
