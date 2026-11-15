'use client'

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'

type SortDirection = 'asc' | 'desc'

type SortableTableHeaderProps = {
  label: string
  active: boolean
  direction: SortDirection
  onSort: () => void
  className?: string
}

export default function SortableTableHeader({
  label,
  active,
  direction,
  onSort,
  className = '',
}: SortableTableHeaderProps) {
  const Icon = active ? (direction === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown
  const nextDirection = active && direction === 'asc' ? 'descending' : 'ascending'

  return (
    <th
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`px-4 py-3 text-slate-800 ${className}`}
    >
      <button
        type="button"
        onClick={onSort}
        title={`Sort ${label} ${nextDirection}`}
        className="inline-flex w-full items-center gap-1.5 text-left font-semibold hover:text-teal-700 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
      >
        <span>{label}</span>
        <Icon
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-teal-700' : 'text-slate-400'}`}
        />
      </button>
    </th>
  )
}
