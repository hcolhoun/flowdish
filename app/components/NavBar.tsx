'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/items', label: 'Items' },
  { href: '/bom', label: 'BOM' },
  { href: '/sops', label: 'SOPs' },
  { href: '/deliveries', label: 'Deliveries' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/prep', label: 'Prep' },
  { href: '/sales', label: 'Sales' },
  { href: '/waste', label: 'Waste' },
  { href: '/forecasts', label: 'Forecasts' },
  { href: '/prep-plan', label: 'Prep Plan' },
]

export default function NavBar() {
  const pathname = usePathname()

  return (
    <div className="border-b bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap gap-2 px-6 py-4">
        {links.map((link) => {
          const active = pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-xl px-4 py-2 text-sm font-medium ${
                active
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {link.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}