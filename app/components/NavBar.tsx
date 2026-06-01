'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type AccessProfile = {
  role: 'OWNER' | 'ADMIN' | 'CHEF' | 'VIEWER' | 'STAFF'
  labels: {
    roleLabel: string
  }
  restaurant: {
    id: string
    name: string
  }
  permissions: {
    isSystemOwner: boolean
    isHeadChef: boolean
    isChefStaff: boolean
    isViewer: boolean
    canSeeAdmin: boolean
    canSeeFullKitchenSystem: boolean
    canSeePrepWasteOnly: boolean
  }
}

const fullLinks = [
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

const staffLinks = [
  { href: '/prep', label: 'Prep' },
  { href: '/waste', label: 'Waste' },
]

const hiddenRoutes = ['/login', '/signup', '/reset-password', '/staff-login']

export default function NavBar() {
  const pathname = usePathname()
  const router = useRouter()

  const [access, setAccess] = useState<AccessProfile | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (hiddenRoutes.includes(pathname)) {
      setLoaded(true)
      return
    }

    async function loadAccess() {
      try {
        const res = await fetch('/api/access', {
          cache: 'no-store',
        })

        if (!res.ok) {
          setAccess(null)
          setLoaded(true)
          return
        }

        const json = await res.json()
        setAccess(json)
      } catch {
        setAccess(null)
      } finally {
        setLoaded(true)
      }
    }

    loadAccess()
  }, [pathname])

  async function handleLogout() {
    await fetch('/api/staff-login', {
      method: 'DELETE',
    })

    const supabase = createClient()
    await supabase.auth.signOut()

    router.push('/login')
    router.refresh()
  }

  const links = useMemo(() => {
    if (!access) return []

    if (access.permissions.canSeeFullKitchenSystem) {
      return access.permissions.canSeeAdmin
        ? [...fullLinks, { href: '/admin', label: 'Admin' }]
        : fullLinks
    }

    return staffLinks
  }, [access])

  if (hiddenRoutes.includes(pathname)) return null

  return (
    <div className="border-b bg-white">
      <div className="mx-auto max-w-7xl px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <Link href="/" className="flex shrink-0 items-center">
            <Image
              src="/flowdish-banner-logo.png"
              alt="Flowdish"
              width={210}
              height={65}
              priority
              className="h-16 w-auto object-contain"
            />
          </Link>

          <div className="flex items-start gap-3">
            {!loaded ? (
              <div className="rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-600">
                Loading…
              </div>
            ) : null}

            {loaded && access ? (
              <div className="hidden rounded-xl border bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:block">
                <div className="font-medium text-slate-900">{access.restaurant.name}</div>
                <div>{access.labels.roleLabel}</div>
              </div>
            ) : null}

            {loaded && !access ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Not logged in
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Logout
            </button>
          </div>
        </div>

        {loaded && access ? (
          <nav className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {links.map((link) => {
              const active =
                pathname === link.href ||
                (link.href !== '/' && pathname.startsWith(`${link.href}/`))

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
          </nav>
        ) : null}
      </div>
    </div>
  )
}