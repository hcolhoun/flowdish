'use client'

import { useEffect, useState } from 'react'
import CopyableError from '@/app/components/CopyableError'

type Item = {
  id: string
  sku: string
  name: string
  itemType: 'L1' | 'L2'
  unitType: 'g' | 'ml' | 'each'
}

type SopListItem = {
  id: string
  itemId: string
  updatedAt: string
  item: {
    id: string
    sku: string
    name: string
    itemType: 'L1' | 'L2'
  }
}

type SopResponse = {
  item: {
    id: string
    sku: string
    name: string
    itemType: 'L1' | 'L2' | 'L3'
    unitType: 'g' | 'ml' | 'each'
  }
  instructions: string
  updatedAt: string | null
  directComponents: Array<{
    itemId: string
    sku: string
    name: string
    qty: number
    unitType: string
  }>
  directIngredients: Array<{
    itemId: string
    sku: string
    name: string
    qty: number
    unitType: string
  }>
  expandedIngredients: Array<{
    parentSku: string
    parentName: string
    sku: string
    name: string
    qty: number
    unitType: string
  }>
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatDate(value: string | null | undefined) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-GB')
}

function buildPdfHtml(sop: SopResponse, instructions: string) {
  const directComponents = sop.directComponents
    .map(
      (row) =>
        `<li>${escapeHtml(row.name)} [${escapeHtml(row.sku)}] — ${row.qty} ${escapeHtml(row.unitType)}</li>`
    )
    .join('')

  const directIngredients = sop.directIngredients
    .map(
      (row) =>
        `<li>${escapeHtml(row.name)} [${escapeHtml(row.sku)}] — ${row.qty} ${escapeHtml(row.unitType)}</li>`
    )
    .join('')

  const expandedRows = sop.expandedIngredients
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.parentName)} [${escapeHtml(row.parentSku)}]</td>
          <td>${escapeHtml(row.name)} [${escapeHtml(row.sku)}]</td>
          <td>${row.qty}</td>
          <td>${escapeHtml(row.unitType)}</td>
        </tr>
      `
    )
    .join('')

  const instructionHtml = escapeHtml(instructions)
    .split('\n')
    .map((line) => `<p>${line || '&nbsp;'}</p>`)
    .join('')

  return `
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(sop.item.name)} SOP</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #0f172a;
            padding: 32px;
            line-height: 1.45;
          }
          h1 {
            font-size: 28px;
            margin-bottom: 4px;
          }
          h2 {
            margin-top: 28px;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 6px;
          }
          .meta {
            color: #475569;
            margin-bottom: 24px;
          }
          ul {
            padding-left: 22px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          th, td {
            border: 1px solid #cbd5e1;
            padding: 8px;
            text-align: left;
          }
          th {
            background: #f1f5f9;
          }
          @media print {
            button {
              display: none;
            }
          }
        </style>
      </head>
      <body>
        <button onclick="window.print()" style="margin-bottom:20px;padding:10px 16px;border-radius:8px;border:1px solid #0f172a;background:#0f172a;color:white;">
          Print / Save as PDF
        </button>

        <h1>${escapeHtml(sop.item.name)} SOP</h1>
        <div class="meta">
          SKU: ${escapeHtml(sop.item.sku)}<br />
          Type: ${escapeHtml(sop.item.itemType)}<br />
          Generated: ${new Date().toLocaleDateString('en-GB')}
        </div>

        ${
          sop.item.itemType === 'L1'
            ? `
              <h2>Direct Components</h2>
              <ul>${directComponents || '<li>None</li>'}</ul>

              <h2>Direct Ingredients</h2>
              <ul>${directIngredients || '<li>None</li>'}</ul>
            `
            : `
              <h2>Ingredients</h2>
              <ul>${directIngredients || '<li>None</li>'}</ul>
            `
        }

        <h2>Expanded Ingredient Breakdown</h2>
        <table>
          <thead>
            <tr>
              <th>Parent</th>
              <th>Ingredient</th>
              <th>Qty</th>
              <th>Unit</th>
            </tr>
          </thead>
          <tbody>
            ${expandedRows || '<tr><td colspan="4">None</td></tr>'}
          </tbody>
        </table>

        <h2>Instructions</h2>
        ${instructionHtml || '<p>No instructions added.</p>'}
      </body>
    </html>
  `
}

export default function SopsPage() {
  const [items, setItems] = useState<Item[]>([])
  const [sopList, setSopList] = useState<SopListItem[]>([])
  const [itemId, setItemId] = useState('')
  const [sop, setSop] = useState<SopResponse | null>(null)
  const [instructions, setInstructions] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function safeJson(res: Response) {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 500))
    }
  }

  async function loadItems() {
    const res = await fetch('/api/items', { cache: 'no-store' })
    const data = await safeJson(res)

    if (!res.ok) {
      throw new Error(data?.error || 'Failed to load items')
    }

    setItems(
      data.filter((item: Item) => item.itemType === 'L1' || item.itemType === 'L2')
    )
  }

  async function loadSopList() {
    const res = await fetch('/api/sops', { cache: 'no-store' })
    const data = await safeJson(res)

    if (!res.ok) {
      throw new Error(data?.error || 'Failed to load SOP list')
    }

    setSopList(data)
  }

  async function loadInitialData() {
    try {
      setError('')
      await Promise.all([loadItems(), loadSopList()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    loadInitialData()
  }, [])

  async function loadSop(selectedItemId: string) {
    try {
      setError('')
      setMessage('')
      setSop(null)
      setInstructions('')

      if (!selectedItemId) return

      const res = await fetch(`/api/sops?itemId=${selectedItemId}`, {
        cache: 'no-store',
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load SOP')
      }

      setItemId(selectedItemId)
      setSop(data)
      setInstructions(data.instructions || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  async function saveSop() {
    if (!itemId) {
      setError('Select an item first')
      return null
    }

    const res = await fetch('/api/sops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId,
        instructions,
      }),
    })

    const data = await safeJson(res)

    if (!res.ok) {
      throw new Error(data?.error || 'Failed to save SOP')
    }

    setSop(data)
    setInstructions(data.instructions || '')
    await loadSopList()

    return data as SopResponse
  }

  async function handleSave() {
    try {
      setError('')
      setMessage('')

      await saveSop()

      setMessage('SOP saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  function openPdfWindow(sopToPrint: SopResponse, instructionText: string) {
    const html = buildPdfHtml(sopToPrint, instructionText)
    const win = window.open('', '_blank')

    if (!win) {
      setError('Popup blocked. Allow popups for Flowdish to generate PDF.')
      return
    }

    win.document.open()
    win.document.write(html)
    win.document.close()

    setTimeout(() => {
      win.focus()
      win.print()
    }, 300)
  }

  async function handleSaveAndGeneratePdf() {
    try {
      setError('')
      setMessage('')

      const saved = await saveSop()

      if (!saved) return

      setMessage('SOP saved. PDF opened — choose “Save as PDF” in the print window.')
      openPdfWindow(saved, saved.instructions || instructions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  async function handleOpenSavedPdf(listItem: SopListItem) {
    try {
      setError('')
      setMessage('')

      const res = await fetch(`/api/sops?itemId=${listItem.itemId}`, {
        cache: 'no-store',
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load SOP PDF')
      }

      openPdfWindow(data, data.instructions || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-semibold text-slate-900">SOP Builder</h1>
        <p className="mt-2 text-slate-800">
          Select an L1 or L2 item. Ingredients are generated automatically from BOMs, and you write the instructions.
        </p>

        {error ? (
          <CopyableError message={error} className="mt-4" />
        ) : null}

        {message ? (
          <div className="sticky top-4 z-40 mt-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700 shadow-sm">
            {message}
          </div>
        ) : null}

        <div className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <label className="mb-2 block text-sm font-medium text-slate-900">
            Recipe / SOP Item
          </label>
          <select
            value={itemId}
            onChange={(e) => loadSop(e.target.value)}
            className="w-full rounded-xl border px-3 py-2"
          >
            <option value="">Select L1 or L2 item</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} [{item.sku}] ({item.itemType})
              </option>
            ))}
          </select>
        </div>

        {sop ? (
          <div className="mt-8 grid gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">
                {sop.item.name} [{sop.item.sku}]
              </h2>
              <p className="mt-1 text-sm text-slate-700">
                Type: {sop.item.itemType}
              </p>

              {sop.item.itemType === 'L1' ? (
                <>
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold text-slate-900">
                      Direct Components
                    </h3>
                    {sop.directComponents.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-700">None.</p>
                    ) : (
                      <ul className="mt-2 space-y-2 text-slate-800">
                        {sop.directComponents.map((row) => (
                          <li key={row.itemId}>
                            {row.name} [{row.sku}] — {row.qty} {row.unitType}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="mt-6">
                    <h3 className="text-lg font-semibold text-slate-900">
                      Direct Ingredients
                    </h3>
                    {sop.directIngredients.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-700">None.</p>
                    ) : (
                      <ul className="mt-2 space-y-2 text-slate-800">
                        {sop.directIngredients.map((row) => (
                          <li key={row.itemId}>
                            {row.name} [{row.sku}] — {row.qty} {row.unitType}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              ) : null}

              {sop.item.itemType === 'L2' ? (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Ingredients
                  </h3>
                  {sop.directIngredients.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-700">None.</p>
                  ) : (
                    <ul className="mt-2 space-y-2 text-slate-800">
                      {sop.directIngredients.map((row) => (
                        <li key={row.itemId}>
                          {row.name} [{row.sku}] — {row.qty} {row.unitType}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              <div className="mt-6">
                <h3 className="text-lg font-semibold text-slate-900">
                  Expanded Ingredient Breakdown
                </h3>
                {sop.expandedIngredients.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-700">None.</p>
                ) : (
                  <div className="mt-3 overflow-hidden rounded-xl border">
                    <table className="w-full text-left">
                      <thead className="bg-slate-100 text-sm">
                        <tr>
                          <th className="px-4 py-3 text-slate-800">Parent</th>
                          <th className="px-4 py-3 text-slate-800">Ingredient</th>
                          <th className="px-4 py-3 text-slate-800">Qty</th>
                          <th className="px-4 py-3 text-slate-800">Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sop.expandedIngredients.map((row, index) => (
                          <tr key={`${row.parentSku}-${row.sku}-${index}`} className="border-t">
                            <td className="px-4 py-3 text-slate-800">
                              {row.parentName} [{row.parentSku}]
                            </td>
                            <td className="px-4 py-3 text-slate-800">
                              {row.name} [{row.sku}]
                            </td>
                            <td className="px-4 py-3 text-slate-800">{row.qty}</td>
                            <td className="px-4 py-3 text-slate-800">{row.unitType}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Instructions</h2>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="mt-4 min-h-[420px] w-full rounded-xl border px-4 py-3"
                placeholder="Write the SOP / method here..."
              />

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  className="rounded-xl bg-slate-900 px-5 py-3 text-white"
                >
                  Save SOP
                </button>

                <button
                  type="button"
                  onClick={handleSaveAndGeneratePdf}
                  className="rounded-xl bg-green-700 px-5 py-3 text-white"
                >
                  Save SOP and Generate PDF
                </button>
              </div>
            </section>
          </div>
        ) : null}

        <section className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-xl font-semibold text-slate-900">Saved SOPs / PDFs</h2>
          </div>

          <table className="w-full text-left">
            <thead className="bg-slate-100 text-sm">
              <tr>
                <th className="px-4 py-3 text-slate-800">Item</th>
                <th className="px-4 py-3 text-slate-800">Type</th>
                <th className="px-4 py-3 text-slate-800">Last Updated</th>
                <th className="px-4 py-3 text-slate-800">Actions</th>
              </tr>
            </thead>

            <tbody>
              {sopList.length === 0 ? (
                <tr className="border-t">
                  <td className="px-4 py-3 text-slate-700" colSpan={4}>
                    No SOPs saved yet.
                  </td>
                </tr>
              ) : (
                sopList.map((saved) => (
                  <tr key={saved.id} className="border-t">
                    <td className="px-4 py-3 text-slate-800">
                      {saved.item.name} [{saved.item.sku}]
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      {saved.item.itemType}
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      {formatDate(saved.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => loadSop(saved.itemId)}
                          className="rounded-lg border px-3 py-1 text-sm text-slate-800 hover:bg-slate-50"
                        >
                          Open SOP
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenSavedPdf(saved)}
                          className="rounded-lg border border-green-300 px-3 py-1 text-sm text-green-700 hover:bg-green-50"
                        >
                          Open PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  )
}
