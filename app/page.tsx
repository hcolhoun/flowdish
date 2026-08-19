'use client'

import { useEffect, useState } from 'react'
import CopyableError from '@/app/components/CopyableError'

type DashboardData = {
  totals: {
    totalItems: number
    totalInventoryLots: number
    inventorySkusOnHand: number
    expiringSoonCount: number
  }
  financials: {
    totalRevenue: number
    totalCogs: number
    grossProfit: number
    grossMarginPercent: number
    totalSpend: number
    stockValue: number
    wasteCost: number
    wastePercent: number
    expiringSoonValue: number
    estimatedSavings: number
    baselineWastePercent: number
  }
  profitByItem: Array<{
    itemId: string
    sku: string
    name: string
    qtySold: number
    revenue: number
    cogs: number
    profit: number
    marginPercent: number
  }>
  lowStockL2: Array<{
    itemId: string
    sku: string
    name: string
    totalQty: number
    unitType: string
  }>
  expiringSoon: Array<{
    id: string
    sku: string
    name: string
    qtyRemaining: number
    unitType: string
    expiryAt: string
    value?: number
  }>
  recentDeliveries: Array<{
    id: string
    deliveredAt: string
    qty: number
    supplier: string | null
    item: { name: string; sku: string }
  }>
  recentPrep: Array<{
    id: string
    preparedAt: string
    qtyOutput: number
    item: { name: string; sku: string; unitType: string }
  }>
  recentSales: Array<{
    id: string
    soldAt: string
    qty: number
    cost?: number
    item: { name: string; sku: string }
  }>
  recentWaste: Array<{
    id: string
    date: string
    qty: number
    item: { name: string; sku: string }
  }>
}

export default function HomePage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')

  async function safeJson(res: Response) {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 500))
    }
  }

  async function loadDashboard() {
    try {
      setError('')

      const res = await fetch('/api/dashboard', { cache: 'no-store' })
      const result = await safeJson(res)

      if (!res.ok) {
        throw new Error(result?.error || 'Failed to load dashboard')
      }

      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  function money(value: number) {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(value || 0)
  }

  function percent(value: number) {
    return `${(value || 0).toFixed(1)}%`
  }

  return (
    <main className="fd-page p-5 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-semibold text-slate-900">
          Flowdish Dashboard
        </h1>

        <p className="mt-2 text-slate-800">
          Financial and operational snapshot across stock, prep, sales, waste, and expiry.
        </p>

        {error ? (
          <CopyableError message={error} className="mt-4" />
        ) : null}

        {!data ? (
          <div className="mt-8 text-sm text-slate-700">Loading dashboard…</div>
        ) : (
          <>
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card title="Total Revenue" value={money(data.financials.totalRevenue)} />
              <Card title="COGS" value={money(data.financials.totalCogs)} />
              <Card
                title="Gross Profit"
                value={money(data.financials.grossProfit)}
                subValue={percent(data.financials.grossMarginPercent)}
                tone="positive"
              />
              <Card
                title="Estimated Savings"
                value={money(data.financials.estimatedSavings)}
                subValue={`vs ${data.financials.baselineWastePercent}% waste baseline`}
                tone="warning"
              />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card title="Purchase Spend" value={money(data.financials.totalSpend)} />
              <Card title="Stock Value" value={money(data.financials.stockValue)} />
              <Card
                title="Waste Cost"
                value={money(data.financials.wasteCost)}
                subValue={percent(data.financials.wastePercent)}
                tone="danger"
              />
              <Card
                title="Expiring Soon Value"
                value={money(data.financials.expiringSoonValue)}
                tone="warning"
              />
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-2">
              <Panel title="Profit by Item">
                {data.profitByItem.length === 0 ? (
                  <EmptyText text="No sales with costing yet." />
                ) : (
                  <SimpleTable
                    headers={['SKU', 'Name', 'Qty Sold', 'Revenue', 'COGS', 'Profit', 'Margin']}
                    rows={data.profitByItem.map((row) => [
                      row.sku,
                      row.name,
                      String(row.qtySold),
                      money(row.revenue),
                      money(row.cogs),
                      money(row.profit),
                      percent(row.marginPercent),
                    ])}
                  />
                )}
              </Panel>

              <Panel title="Low Stock L2">
                {data.lowStockL2.length === 0 ? (
                  <EmptyText text="No zero-stock L2 items." />
                ) : (
                  <SimpleTable
                    headers={['SKU', 'Name', 'Qty', 'Unit']}
                    rows={data.lowStockL2.map((row) => [
                      row.sku,
                      row.name,
                      String(row.totalQty),
                      row.unitType,
                    ])}
                  />
                )}
              </Panel>
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-2">
              <Panel title="Expiring Soon">
                {data.expiringSoon.length === 0 ? (
                  <EmptyText text="No lots expiring within 7 days." />
                ) : (
                  <SimpleTable
                    headers={['SKU', 'Name', 'Qty', 'Unit', 'Expiry', 'Value']}
                    rows={data.expiringSoon.map((row) => [
                      row.sku,
                      row.name,
                      String(row.qtyRemaining),
                      row.unitType,
                      new Date(row.expiryAt).toLocaleDateString('en-GB'),
                      money(row.value ?? 0),
                    ])}
                  />
                )}
              </Panel>

              <Panel title="Recent Deliveries">
                <SimpleTable
                  headers={['Date', 'Item', 'Qty', 'Supplier']}
                  rows={data.recentDeliveries.map((row) => [
                    new Date(row.deliveredAt).toLocaleDateString('en-GB'),
                    `${row.item.name} [${row.item.sku}]`,
                    String(row.qty),
                    row.supplier ?? '',
                  ])}
                />
              </Panel>
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-2">
              <Panel title="Recent Prep">
                <SimpleTable
                  headers={['Date', 'Item', 'Qty', 'Unit']}
                  rows={data.recentPrep.map((row) => [
                    new Date(row.preparedAt).toLocaleDateString('en-GB'),
                    `${row.item.name} [${row.item.sku}]`,
                    String(row.qtyOutput),
                    row.item.unitType,
                  ])}
                />
              </Panel>

              <Panel title="Recent Sales">
                <SimpleTable
                  headers={['Date', 'Item', 'Qty', 'Cost']}
                  rows={data.recentSales.map((row) => [
                    new Date(row.soldAt).toLocaleDateString('en-GB'),
                    `${row.item.name} [${row.item.sku}]`,
                    String(row.qty),
                    money(row.cost ?? 0),
                  ])}
                />
              </Panel>

              <Panel title="Recent Waste">
                <SimpleTable
                  headers={['Date', 'Item', 'Qty']}
                  rows={data.recentWaste.map((row) => [
                    new Date(row.date).toLocaleDateString('en-GB'),
                    `${row.item.name} [${row.item.sku}]`,
                    String(row.qty),
                  ])}
                />
              </Panel>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

function Card({
  title,
  value,
  subValue,
  tone = 'primary',
}: {
  title: string
  value: string
  subValue?: string
  tone?: 'primary' | 'positive' | 'warning' | 'danger'
}) {
  return (
    <div className="fd-metric-card p-5" data-tone={tone}>
      <div className="text-sm text-slate-700">{title}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-900">{value}</div>
      {subValue ? <div className="mt-1 text-sm text-slate-700">{subValue}</div> : null}
    </div>
  )
}

function Panel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="fd-panel">
      <div className="fd-panel-heading px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      </div>
      <div>{children}</div>
    </section>
  )
}

function EmptyText({ text }: { text: string }) {
  return <div className="px-5 py-4 text-sm text-slate-700">{text}</div>
}

function SimpleTable({
  headers,
  rows,
}: {
  headers: string[]
  rows: string[][]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="fd-data-table w-full text-left">
        <thead className="text-sm">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-3 text-slate-800">
                {header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr className="border-t">
              <td className="px-4 py-3 text-sm text-slate-700" colSpan={headers.length}>
                No records.
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="border-t">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-3 text-slate-800">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
