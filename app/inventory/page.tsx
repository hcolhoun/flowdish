'use client'

import { useEffect, useState } from 'react'

type InventoryRow = {
  itemId: string
  sku: string
  name: string
  unitType: string
  totalQty: number
  nextExpiry: string | null
}

export default function InventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([])

  async function loadRows() {
    const res = await fetch('/api/inventory')
    const data = await res.json()
    setRows(data)
  }

  useEffect(() => {
    loadRows()
  }, [])

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-semibold">Inventory</h1>

        <div className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-sm">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Qty On Hand</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Next Expiry</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.itemId} className="border-t">
                  <td className="px-4 py-3">{row.sku}</td>
                  <td className="px-4 py-3">{row.name}</td>
                  <td className="px-4 py-3">{row.totalQty}</td>
                  <td className="px-4 py-3">{row.unitType}</td>
                  <td className="px-4 py-3">
                    {row.nextExpiry ? new Date(row.nextExpiry).toLocaleDateString('en-GB') : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}