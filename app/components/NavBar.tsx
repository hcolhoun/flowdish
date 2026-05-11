'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/items', label: 'Items' },
  { href: '/bom', label: 'BOM' },
  { href: '/sops', label: 'SOPs' },
  { href: '/suppliers', label: 'Supplier Products' },
  { href: '/deliveries', label: 'Deliveries' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/prep', label: 'Prep' },
  { href: '/sales', label: 'Sales' },
  { href: '/waste', label: 'Waste' },
  { href: '/planning', label: 'Planning' },
]

export default function NavBar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (pathname === '/login') return null

  return (
    <div className="border-b bg-white">
      <div className="mx-auto max-w-7xl px-6 py-4">
        <Link href="/" className="mb-3 flex justify-center">
          <Image
            src="/flowdish-banner-logo.png"
            alt="Flowdish"
            width={260}
            height={80}
            priority
            className="h-10 w-auto"
          />
        </Link>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {links.map((link) => {
            const active = pathname === link.href

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-xl px-4 py-2 text-sm font-medium ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                }`}
              >
                {link.label}
              </Link>
            )
          })}

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  )
}