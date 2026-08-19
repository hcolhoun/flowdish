'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import ThemeToggle from '@/app/components/ThemeToggle'
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
  { href: '/suppliers', label: 'Supplier Products' },
  { href: '/bom', label: 'BOM' },
  { href: '/sops', label: 'SOPs' },
  { href: '/deliveries', label: 'Deliveries' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/planning', label: 'Planning' },
  { href: '/prep', label: 'Record Prep' },
  { href: '/sales', label: 'Sales' },
  { href: '/waste', label: 'Waste' },
  { href: '/cold-storage', label: 'Cold Storage' },
]

const staffLinks = [
  { href: '/prep', label: 'Record Prep' },
  { href: '/waste', label: 'Waste' },
]

const hiddenRoutes = ['/login', '/signup', '/reset-password', '/staff-login', '/privacy']

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

  if (hiddenRoutes.includes(pathname)) {
    return (
      <div className="fixed right-3 top-3 z-50 sm:right-5 sm:top-5">
        <ThemeToggle />
      </div>
    )
  }

  return (
    <header className="fd-app-header">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex shrink-0 items-center">
            <Image
              src="/flowdish-banner-logo.png"
              alt="Flowdish"
              width={210}
              height={65}
              priority
              className="h-12 w-auto object-contain sm:h-14"
            />
          </Link>

          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <ThemeToggle />

            {!loaded ? (
              <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
                Loading...
              </div>
            ) : null}

            {loaded && access ? (
              <div className="hidden rounded-lg border bg-slate-50 px-3 py-2 text-xs text-slate-600 md:block">
                <div className="font-medium text-slate-900">{access.restaurant.name}</div>
                <div>{access.labels.roleLabel}</div>
              </div>
            ) : null}

            {loaded && !access ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Not logged in
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 sm:px-4"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {loaded && access ? (
        <div className="fd-app-nav">
          <nav className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6 xl:justify-center">
            {links.map((link) => {
              const active =
                pathname === link.href ||
                (link.href !== '/' && pathname.startsWith(`${link.href}/`))

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="fd-nav-link"
                  data-active={active}
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>
        </div>
      ) : null}
    </header>
  )
}
