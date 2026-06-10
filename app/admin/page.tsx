'use client'

import { useEffect, useMemo, useState } from 'react'

type Membership = {
  id: string
  authUserId: string
  email: string | null
  role: 'OWNER' | 'ADMIN' | 'CHEF' | 'VIEWER'
  displayRole?: string
  createdAt: string
}

type StaffUser = {
  id: string
  username: string
  displayName: string
  active: boolean
  isAccountPin: boolean
  accountEmail: string | null
  createdAt: string
}

type Restaurant = {
  id: string
  name: string
  slug: string | null
  isTemplate: boolean
  plan: 'BASIC' | 'PREMIUM'
  staffLoginCode: string
  createdAt: string
  updatedAt: string
}

type AdminData = {
  currentUser: {
    authUserId: string
    email: string | null
    role: 'OWNER' | 'ADMIN' | 'CHEF' | 'VIEWER'
    isSystemOwner: boolean
    isHeadChef: boolean
  }
  restaurant: Restaurant
  memberships: Membership[]
  staffUsers: StaffUser[]
  accountPin: StaffUser | null
  staffLimits: {
    plan: 'BASIC' | 'PREMIUM'
    activeStaffCount: number
    activeAccountPinCount: number
    totalActivePinCount: number
    maxStaffUsers: number | null
    remainingStaffUsers: number | null
  }
  permissions: {
    canCreateRestaurants: boolean
    canManageRestaurantMembers: boolean
    canCreateStaffUsers: boolean
  }
}

type CreateRestaurantResult = {
  success?: boolean
  mode?: string
  restaurant?: {
    id: string
    name: string
  }
  membership?: {
    email: string | null
    role: string
  }
  frontloadResult?: {
    itemCount: number
    supplierProductCount: number
    sopCount: number
  } | null
  error?: string
}

type CreateStaffResult = {
  success?: boolean
  staffUser?: StaffUser
  login?: {
    restaurantCode: string
    username: string
  }
  error?: string
}

type AccountPinResult = CreateStaffResult

type AdminRestaurant = {
  id: string
  name: string
  slug: string | null
  plan: 'BASIC' | 'PREMIUM'
  createdAt: string
  counts: {
    items: number
    supplierProducts: number
    l0Links: number
  }
  owners: Array<{
    email: string | null
    authUserId: string
  }>
}

type TemplateL0 = {
  id: string
  sku: string
  name: string
  unitType: string
  sellingPrice: number | null
  l1Count: number
}

type FrontloadResult = {
  ok?: boolean
  targetRestaurantId?: string
  selectedL0Count?: number
  copiedOrReusedItems?: number
  copiedBomRows?: {
    l0l1: number
    l1l2: number
    l1l3: number
    l2l2: number
    l2l3: number
  }
  copiedSops?: number
  supplierProducts?: {
    created: number
    updated: number
  }
  error?: string
}

type AiUsageRow = {
  restaurantId: string
  restaurantName: string
  plan: 'BASIC' | 'PREMIUM'
  feature: string
  model: string
  requestCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  missingTokenCount: number
  lastUsedAt: string
}

type AiUsageResponse = {
  rows: AiUsageRow[]
  totalRequests: number
  totalTokens: number
}

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingRestaurant, setSavingRestaurant] = useState(false)
  const [savingStaff, setSavingStaff] = useState(false)
  const [savingAccountPin, setSavingAccountPin] = useState(false)
  const [loadingFrontloadData, setLoadingFrontloadData] = useState(false)
  const [frontloading, setFrontloading] = useState(false)

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [newRestaurantEmail, setNewRestaurantEmail] = useState('')
  const [newRestaurantName, setNewRestaurantName] = useState('')
  const [newRestaurantMode, setNewRestaurantMode] = useState<'EMPTY' | 'FRONTLOAD'>('EMPTY')
  const [restaurantResult, setRestaurantResult] = useState<CreateRestaurantResult | null>(null)

  const [staffDisplayName, setStaffDisplayName] = useState('')
  const [staffPin, setStaffPin] = useState('')
  const [staffResult, setStaffResult] = useState<CreateStaffResult | null>(null)
  const [accountPinDisplayName, setAccountPinDisplayName] = useState('')
  const [accountPin, setAccountPin] = useState('')
  const [accountPinResult, setAccountPinResult] = useState<AccountPinResult | null>(null)

  const [restaurants, setRestaurants] = useState<AdminRestaurant[]>([])
  const [templateL0s, setTemplateL0s] = useState<TemplateL0[]>([])
  const [aiUsage, setAiUsage] = useState<AiUsageResponse | null>(null)
  const [loadingAiUsage, setLoadingAiUsage] = useState(false)
  const [selectedRestaurantId, setSelectedRestaurantId] = useState('')
  const [selectedL0Ids, setSelectedL0Ids] = useState<string[]>([])
  const [frontloadResult, setFrontloadResult] = useState<FrontloadResult | null>(null)

  const selectedRestaurant = useMemo(
    () => restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) || null,
    [restaurants, selectedRestaurantId]
  )

  const staffPinUsers = useMemo(
    () => data?.staffUsers.filter((staff) => !staff.isAccountPin) || [],
    [data?.staffUsers]
  )

  async function safeJson(res: Response) {
    const text = await res.text()

    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 1000))
    }
  }

  async function loadData() {
    try {
      setLoading(true)
      setError('')

      const res = await fetch('/api/admin/current-restaurant', {
        cache: 'no-store',
      })

      const json = await safeJson(res)

      if (!res.ok) {
        throw new Error(json?.error || 'Failed to load admin data')
      }

      setData(json)
      setAccountPinDisplayName(json.accountPin?.displayName || json.currentUser.email || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  async function loadFrontloadData() {
    try {
      setLoadingFrontloadData(true)
      setError('')

      const [restaurantsRes, templateL0sRes] = await Promise.all([
        fetch('/api/admin/restaurants', { cache: 'no-store' }),
        fetch('/api/admin/template-l0s', { cache: 'no-store' }),
      ])

      const restaurantsJson = await safeJson(restaurantsRes)
      const templateL0sJson = await safeJson(templateL0sRes)

      if (!restaurantsRes.ok) {
        throw new Error(restaurantsJson?.error || 'Failed to load restaurants')
      }

      if (!templateL0sRes.ok) {
        throw new Error(templateL0sJson?.error || 'Failed to load template L0 menus')
      }

      const nextRestaurants = restaurantsJson.restaurants || []
      const nextTemplateL0s = templateL0sJson.l0Menus || []

      setRestaurants(nextRestaurants)
      setTemplateL0s(nextTemplateL0s)

      if (!selectedRestaurantId && nextRestaurants.length > 0) {
        setSelectedRestaurantId(nextRestaurants[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoadingFrontloadData(false)
    }
  }

  async function loadAiUsage() {
    try {
      setLoadingAiUsage(true)
      const res = await fetch('/api/admin/ai-usage', { cache: 'no-store' })
      const json = await safeJson(res)

      if (!res.ok) {
        throw new Error(json?.error || 'Failed to load AI usage')
      }

      setAiUsage(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoadingAiUsage(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (data?.permissions.canCreateRestaurants) {
      loadFrontloadData()
      loadAiUsage()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.permissions.canCreateRestaurants])

  async function handleCreateRestaurant(e: React.FormEvent) {
    e.preventDefault()

    try {
      setSavingRestaurant(true)
      setError('')
      setMessage('')
      setRestaurantResult(null)

      const res = await fetch('/api/admin/create-restaurant-for-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newRestaurantEmail,
          restaurantName: newRestaurantName,
          mode: newRestaurantMode,
        }),
      })

      const json = await safeJson(res)

      if (!res.ok) {
        throw new Error(json?.error || 'Failed to create restaurant')
      }

      setRestaurantResult(json)
      setMessage(
        newRestaurantMode === 'FRONTLOAD'
          ? 'Restaurant created and frontloaded from template.'
          : 'Empty restaurant created for user.'
      )

      setNewRestaurantEmail('')
      setNewRestaurantName('')
      setNewRestaurantMode('EMPTY')

      await loadData()
      await loadFrontloadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSavingRestaurant(false)
    }
  }

  async function handleCreateStaffUser(e: React.FormEvent) {
    e.preventDefault()

    try {
      setSavingStaff(true)
      setError('')
      setMessage('')
      setStaffResult(null)

      const res = await fetch('/api/admin/create-staff-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: staffDisplayName,
          pin: staffPin,
        }),
      })

      const json = await safeJson(res)

      if (!res.ok) {
        throw new Error(json?.error || 'Failed to create staff user')
      }

      setStaffResult(json)
      setMessage(`Staff user created: ${json.login?.username}`)

      setStaffDisplayName('')
      setStaffPin('')

      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSavingStaff(false)
    }
  }

  async function handleSaveAccountPin(e: React.FormEvent) {
    e.preventDefault()

    try {
      setSavingAccountPin(true)
      setError('')
      setMessage('')
      setAccountPinResult(null)

      const res = await fetch('/api/admin/account-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: accountPinDisplayName,
          pin: accountPin,
        }),
      })

      const json = await safeJson(res)

      if (!res.ok) {
        throw new Error(json?.error || 'Failed to save your PIN')
      }

      setAccountPinResult(json)
      setMessage(`Your PIN login is ready: ${json.login?.username}`)
      setAccountPin('')

      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSavingAccountPin(false)
    }
  }

  function toggleL0(id: string) {
    setSelectedL0Ids((current) =>
      current.includes(id)
        ? current.filter((currentId) => currentId !== id)
        : [...current, id]
    )
  }

  function selectAllL0s() {
    setSelectedL0Ids(templateL0s.map((item) => item.id))
  }

  function clearL0s() {
    setSelectedL0Ids([])
  }

  async function handleFrontloadSelectedMenus() {
    try {
      setFrontloading(true)
      setError('')
      setMessage('')
      setFrontloadResult(null)

      if (!selectedRestaurantId) {
        throw new Error('Choose a customer restaurant first.')
      }

      if (selectedL0Ids.length === 0) {
        throw new Error('Choose at least one L0 menu to load.')
      }

      const selectedNames = templateL0s
        .filter((item) => selectedL0Ids.includes(item.id))
        .map((item) => item.name)
        .join(', ')

      const confirmed = window.confirm(
        `Load ${selectedL0Ids.length} selected L0 menu(s) into ${
          selectedRestaurant?.name || 'this restaurant'
        }?\n\n${selectedNames}\n\nThis will copy/reuse items, BOMs, SOPs, and linked supplier products.`
      )

      if (!confirmed) {
        return
      }

      const res = await fetch('/api/admin/frontload-l0', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetRestaurantId: selectedRestaurantId,
          l0ItemIds: selectedL0Ids,
        }),
      })

      const json = await safeJson(res)

      if (!res.ok) {
        throw new Error(json?.error || 'Failed to load selected menus')
      }

      setFrontloadResult(json)
      setMessage(`Loaded ${selectedL0Ids.length} selected menu(s) into ${selectedRestaurant?.name || 'restaurant'}.`)
      setSelectedL0Ids([])

      await loadFrontloadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setFrontloading(false)
    }
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  function money(value: number | null) {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(value || 0)
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Admin</h1>
            <p className="mt-2 text-slate-700">
              Manage restaurant access, staff PIN users, system-owner onboarding, and selected template menu loading.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              loadData()
              if (data?.permissions.canCreateRestaurants) {
                loadFrontloadData()
                loadAiUsage()
              }
            }}
            className="rounded-xl border bg-white px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="mt-6 rounded-xl border bg-white px-4 py-3 text-sm text-slate-700">
            Loading admin data…
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 whitespace-pre-wrap rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="mt-6 whitespace-pre-wrap rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
            {message}
          </div>
        ) : null}

        {data ? (
          <>
            <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Current Restaurant</h2>

              <div className="mt-5 grid gap-4 md:grid-cols-4">
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Restaurant</div>
                  <div className="mt-1 font-semibold text-slate-900">{data.restaurant.name}</div>
                </div>

                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Plan</div>
                  <div className="mt-1 font-semibold text-slate-900">{data.restaurant.plan}</div>
                </div>

                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Staff Login Code</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
                    {data.restaurant.staffLoginCode}
                  </div>
                </div>

                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Staff PIN Users</div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {data.staffLimits.activeStaffCount}
                    {data.staffLimits.maxStaffUsers === null
                      ? ' / unlimited'
                      : ` / ${data.staffLimits.maxStaffUsers}`}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Account PINs: {data.staffLimits.activeAccountPinCount}
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                Staff users log in at <span className="font-mono">/staff-login</span> using
                the staff login code, username, and 4-digit PIN. Staff sessions expire after 2 hours.
              </div>
            </section>

            {data.currentUser.isSystemOwner ? (
              <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">DeepSeek Usage</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Token usage by restaurant and AI import feature.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={loadAiUsage}
                    disabled={loadingAiUsage}
                    className="rounded-xl border px-4 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    {loadingAiUsage ? 'Loading...' : 'Refresh Usage'}
                  </button>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border bg-slate-50 p-4">
                    <div className="text-xs text-slate-500">DeepSeek Requests</div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">
                      {aiUsage?.totalRequests ?? 0}
                    </div>
                  </div>

                  <div className="rounded-xl border bg-slate-50 p-4">
                    <div className="text-xs text-slate-500">Total Tokens</div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">
                      {(aiUsage?.totalTokens ?? 0).toLocaleString('en-GB')}
                    </div>
                  </div>
                </div>

                <div className="mt-5 overflow-hidden rounded-xl border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="px-4 py-3">Restaurant</th>
                        <th className="px-4 py-3">Feature</th>
                        <th className="px-4 py-3">Model</th>
                        <th className="px-4 py-3">Requests</th>
                        <th className="px-4 py-3">Tokens</th>
                        <th className="px-4 py-3">Last Used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiUsage?.rows.length ? (
                        aiUsage.rows.map((row) => (
                          <tr
                            key={`${row.restaurantId}-${row.feature}-${row.model}`}
                            className="border-t"
                          >
                            <td className="px-4 py-3">{row.restaurantName}</td>
                            <td className="px-4 py-3">{row.feature}</td>
                            <td className="px-4 py-3">{row.model}</td>
                            <td className="px-4 py-3">{row.requestCount}</td>
                            <td className="px-4 py-3">
                              {row.totalTokens.toLocaleString('en-GB')}
                              {row.missingTokenCount > 0 ? (
                                <span className="ml-2 text-xs text-amber-700">
                                  {row.missingTokenCount} without token count
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-3">{formatDate(row.lastUsedAt)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr className="border-t">
                          <td className="px-4 py-3 text-slate-600" colSpan={6}>
                            No DeepSeek usage logged yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Head Chef / Owner Members</h2>

              <div className="mt-5 overflow-hidden rounded-xl border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.memberships.map((member) => (
                      <tr key={member.id} className="border-t">
                        <td className="px-4 py-3">{member.email || 'Unknown'}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                            {member.displayRole || member.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">{formatDate(member.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Your PIN Login</h2>
              <p className="mt-1 text-sm text-slate-600">
                This gives the account user a quick PIN login for Prep and Waste. It does not use
                one of the Basic plan staff PIN slots.
              </p>

              {data.accountPin ? (
                <div className="mt-5 rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Current PIN username:{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {data.accountPin.username}
                  </span>
                </div>
              ) : null}

              <form onSubmit={handleSaveAccountPin} className="mt-6 grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-900">
                    Display Name
                  </label>
                  <input
                    value={accountPinDisplayName}
                    onChange={(e) => setAccountPinDisplayName(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2"
                    placeholder="Head Chef"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-900">
                    4 Digit PIN
                  </label>
                  <input
                    value={accountPin}
                    onChange={(e) => setAccountPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full rounded-xl border px-3 py-2"
                    placeholder="1234"
                    inputMode="numeric"
                    maxLength={4}
                    required
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={savingAccountPin}
                    className="rounded-xl bg-slate-900 px-5 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingAccountPin ? 'Saving...' : data.accountPin ? 'Update My PIN' : 'Create My PIN'}
                  </button>
                </div>
              </form>

              {accountPinResult?.login ? (
                <div className="mt-5 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
                  Your PIN login:{' '}
                  <span className="font-mono">
                    {accountPinResult.login.restaurantCode} / {accountPinResult.login.username}
                  </span>
                </div>
              ) : null}
            </section>

            <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Staff PIN Users</h2>
              <p className="mt-1 text-sm text-slate-600">
                Staff users can only access Prep and Waste. Basic includes 3 staff PIN users plus
                the account PIN above.
              </p>

              <div className="mt-5 overflow-hidden rounded-xl border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-4 py-3">Display Name</th>
                      <th className="px-4 py-3">Username</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffPinUsers.length === 0 ? (
                      <tr>
                        <td className="px-4 py-3 text-slate-600" colSpan={4}>
                          No staff PIN users yet.
                        </td>
                      </tr>
                    ) : (
                      staffPinUsers.map((staff) => (
                        <tr key={staff.id} className="border-t">
                          <td className="px-4 py-3">{staff.displayName}</td>
                          <td className="px-4 py-3 font-mono text-xs">{staff.username}</td>
                          <td className="px-4 py-3">
                            {staff.active ? (
                              <span className="rounded-lg bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">
                                Active
                              </span>
                            ) : (
                              <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                                Inactive
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">{formatDate(staff.createdAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {data.permissions.canCreateStaffUsers ? (
                <form onSubmit={handleCreateStaffUser} className="mt-6 grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-900">
                      Staff First Name
                    </label>
                    <input
                      value={staffDisplayName}
                      onChange={(e) => setStaffDisplayName(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2"
                      placeholder="John"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-900">
                      4 Digit PIN
                    </label>
                    <input
                      value={staffPin}
                      onChange={(e) => setStaffPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="w-full rounded-xl border px-3 py-2"
                      placeholder="1234"
                      inputMode="numeric"
                      maxLength={4}
                      required
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={savingStaff}
                      className="rounded-xl bg-slate-900 px-5 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingStaff ? 'Creating…' : 'Create Staff User'}
                    </button>
                  </div>
                </form>
              ) : null}

              {staffResult?.login ? (
                <div className="mt-5 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
                  Created staff login:{' '}
                  <span className="font-mono">
                    {staffResult.login.restaurantCode} / {staffResult.login.username}
                  </span>
                </div>
              ) : null}
            </section>

            {data.permissions.canCreateRestaurants ? (
              <>
                <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-semibold text-slate-900">
                    System Owner: Create Restaurant
                  </h2>

                  <p className="mt-1 text-sm text-slate-600">
                    The Head Chef user must already exist in Supabase Auth. Normal customer signup already creates an empty restaurant.
                    Use this only when you need to manually create or reassign a restaurant.
                  </p>

                  <form onSubmit={handleCreateRestaurant} className="mt-6 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-900">
                        Head Chef Email
                      </label>
                      <input
                        type="email"
                        value={newRestaurantEmail}
                        onChange={(e) => setNewRestaurantEmail(e.target.value)}
                        className="w-full rounded-xl border px-3 py-2"
                        placeholder="chef@example.com"
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-900">
                        Restaurant Name
                      </label>
                      <input
                        value={newRestaurantName}
                        onChange={(e) => setNewRestaurantName(e.target.value)}
                        className="w-full rounded-xl border px-3 py-2"
                        placeholder="Customer Restaurant"
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-900">
                        Setup Type
                      </label>
                      <select
                        value={newRestaurantMode}
                        onChange={(e) =>
                          setNewRestaurantMode(e.target.value as 'EMPTY' | 'FRONTLOAD')
                        }
                        className="w-full rounded-xl border px-3 py-2"
                      >
                        <option value="EMPTY">Empty restaurant</option>
                        <option value="FRONTLOAD">Full frontload from Flowdish template</option>
                      </select>
                    </div>

                    <div className="flex items-end">
                      <button
                        type="submit"
                        disabled={savingRestaurant}
                        className="rounded-xl bg-slate-900 px-5 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingRestaurant ? 'Creating…' : 'Create Restaurant'}
                      </button>
                    </div>
                  </form>

                  {restaurantResult ? (
                    <div className="mt-5 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
                      Restaurant created: {restaurantResult.restaurant?.name || 'Unknown'}
                      {restaurantResult.frontloadResult ? (
                        <div className="mt-1">
                          Copied {restaurantResult.frontloadResult.itemCount} item(s),{' '}
                          {restaurantResult.frontloadResult.supplierProductCount} supplier product(s),{' '}
                          {restaurantResult.frontloadResult.sopCount} SOP(s).
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900">
                        System Owner: Load Selected Template L0 Menus
                      </h2>
                      <p className="mt-1 text-sm text-slate-600">
                        Choose a customer restaurant, then copy selected L0 menus from the protected Flowdish template.
                        The copied data becomes that customer&apos;s own data.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={loadFrontloadData}
                      disabled={loadingFrontloadData}
                      className="rounded-xl border bg-white px-4 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loadingFrontloadData ? 'Loading…' : 'Refresh Lists'}
                    </button>
                  </div>

                  <div className="mt-6 grid gap-6 lg:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-900">
                        Customer Restaurant
                      </label>

                      <select
                        value={selectedRestaurantId}
                        onChange={(e) => setSelectedRestaurantId(e.target.value)}
                        className="w-full rounded-xl border px-3 py-2"
                      >
                        {restaurants.length === 0 ? (
                          <option value="">No customer restaurants found</option>
                        ) : (
                          restaurants.map((restaurant) => (
                            <option key={restaurant.id} value={restaurant.id}>
                              {restaurant.name} — {restaurant.owners[0]?.email || 'No owner email'}
                            </option>
                          ))
                        )}
                      </select>

                      {selectedRestaurant ? (
                        <div className="mt-3 rounded-xl border bg-slate-50 p-4 text-sm text-slate-700">
                          <div>
                            <span className="font-semibold text-slate-900">Name:</span>{' '}
                            {selectedRestaurant.name}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-900">Owner:</span>{' '}
                            {selectedRestaurant.owners[0]?.email || 'No owner email'}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-900">Current items:</span>{' '}
                            {selectedRestaurant.counts.items}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-900">Supplier products:</span>{' '}
                            {selectedRestaurant.counts.supplierProducts}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <label className="block text-sm font-medium text-slate-900">
                          Template L0 Menus
                        </label>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={selectAllL0s}
                            className="rounded-lg border px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                          >
                            Select all
                          </button>
                          <button
                            type="button"
                            onClick={clearL0s}
                            className="rounded-lg border px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <div className="max-h-96 overflow-y-auto rounded-xl border bg-white">
                        {templateL0s.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-slate-600">
                            No L0 menus found in the template restaurant.
                          </div>
                        ) : (
                          templateL0s.map((item) => (
                            <label
                              key={item.id}
                              className="flex cursor-pointer gap-3 border-t px-4 py-3 first:border-t-0 hover:bg-slate-50"
                            >
                              <input
                                type="checkbox"
                                checked={selectedL0Ids.includes(item.id)}
                                onChange={() => toggleL0(item.id)}
                                className="mt-1"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-slate-900">{item.name}</div>
                                <div className="mt-1 text-xs text-slate-600">
                                  {item.sku} · {item.l1Count} L1 item(s) · {money(item.sellingPrice)}
                                </div>
                              </div>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm text-slate-700">
                      Selected: <span className="font-semibold">{selectedL0Ids.length}</span> L0 menu(s)
                    </div>

                    <button
                      type="button"
                      onClick={handleFrontloadSelectedMenus}
                      disabled={frontloading || !selectedRestaurantId || selectedL0Ids.length === 0}
                      className="rounded-xl bg-slate-900 px-5 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {frontloading ? 'Loading menus…' : 'Load Selected Menus'}
                    </button>
                  </div>

                  {frontloadResult ? (
                    <div className="mt-5 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
                      <div className="font-semibold">Frontload complete.</div>
                      <div className="mt-1">
                        Copied or reused {frontloadResult.copiedOrReusedItems || 0} item(s).
                      </div>
                      <div>
                        Supplier products created: {frontloadResult.supplierProducts?.created || 0}.
                        Updated: {frontloadResult.supplierProducts?.updated || 0}.
                      </div>
                      <div>
                        SOPs copied: {frontloadResult.copiedSops || 0}.
                      </div>
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  )
}
