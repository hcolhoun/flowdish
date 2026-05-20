'use client'

import { useEffect, useState } from 'react'

type Membership = {
  id: string
  authUserId: string
  email: string | null
  role: 'OWNER' | 'ADMIN' | 'CHEF' | 'VIEWER'
  createdAt: string
}

type Restaurant = {
  id: string
  name: string
  slug: string | null
  isTemplate: boolean
  createdAt: string
  updatedAt: string
}

type TemplateRestaurant = {
  id: string
  name: string
  slug: string | null
  isTemplate: boolean
  createdAt: string
}

type AdminData = {
  currentUser: {
    authUserId: string
    email: string | null
    role: 'OWNER' | 'ADMIN' | 'CHEF' | 'VIEWER'
  }
  restaurant: Restaurant
  memberships: Membership[]
  templateRestaurants: TemplateRestaurant[]
}

type CreateResult = {
  success?: boolean
  mode?: string
  restaurant?: Restaurant
  membership?: {
    id: string
    authUserId: string
    email: string | null
    restaurantId: string
    role: string
    restaurant?: Restaurant
  }
  frontloadResult?: {
    itemCount: number
    supplierProductCount: number
    sopCount: number
  } | null
  error?: string
}

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [email, setEmail] = useState('')
  const [restaurantName, setRestaurantName] = useState('')
  const [mode, setMode] = useState<'EMPTY' | 'FRONTLOAD'>('EMPTY')
  const [result, setResult] = useState<CreateResult | null>(null)

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleCreateRestaurant(e: React.FormEvent) {
    e.preventDefault()

    try {
      setSaving(true)
      setError('')
      setMessage('')
      setResult(null)

      const res = await fetch('/api/admin/create-restaurant-for-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          restaurantName,
          mode,
        }),
      })

      const json = await safeJson(res)

      if (!res.ok) {
        throw new Error(json?.error || 'Failed to create restaurant')
      }

      setResult(json)
      setMessage(
        mode === 'FRONTLOAD'
          ? 'Restaurant created and frontloaded from template.'
          : 'Empty restaurant created for user.'
      )

      setEmail('')
      setRestaurantName('')
      setMode('EMPTY')

      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Admin</h1>
            <p className="mt-2 text-slate-700">
              Manage restaurant accounts, members, and new user setup.
            </p>
          </div>

          <button
            type="button"
            onClick={loadData}
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
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    Current Restaurant
                  </h2>

                  <div className="mt-4 space-y-2 text-sm text-slate-700">
                    <div>
                      <span className="font-medium text-slate-900">Name:</span>{' '}
                      {data.restaurant.name}
                    </div>

                    <div>
                      <span className="font-medium text-slate-900">Restaurant ID:</span>{' '}
                      <span className="font-mono text-xs">{data.restaurant.id}</span>
                    </div>

                    <div>
                      <span className="font-medium text-slate-900">Template:</span>{' '}
                      {data.restaurant.isTemplate ? 'Yes' : 'No'}
                    </div>

                    <div>
                      <span className="font-medium text-slate-900">Your role:</span>{' '}
                      {data.currentUser.role}
                    </div>

                    <div>
                      <span className="font-medium text-slate-900">Your email:</span>{' '}
                      {data.currentUser.email || 'Unknown'}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">Templates available</div>
                  <div className="mt-1">
                    {data.templateRestaurants.length === 0
                      ? 'No template restaurants found.'
                      : `${data.templateRestaurants.length} template restaurant(s) found.`}
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Members</h2>
              <p className="mt-1 text-sm text-slate-600">
                These users currently have access to this restaurant account.
              </p>

              <div className="mt-5 overflow-hidden rounded-xl border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Added</th>
                      <th className="px-4 py-3">Auth User ID</th>
                    </tr>
                  </thead>

                  <tbody>
                    {data.memberships.length === 0 ? (
                      <tr>
                        <td className="px-4 py-3 text-slate-600" colSpan={4}>
                          No members found.
                        </td>
                      </tr>
                    ) : (
                      data.memberships.map((member) => (
                        <tr key={member.id} className="border-t">
                          <td className="px-4 py-3">{member.email || 'Unknown'}</td>
                          <td className="px-4 py-3">
                            <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                              {member.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">{formatDate(member.createdAt)}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">
                            {member.authUserId}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">
                Create Restaurant for User
              </h2>

              <p className="mt-1 text-sm text-slate-600">
                The user must already exist in Supabase Auth. Ask them to sign up first,
                then create either an empty account or a frontloaded copy of the template.
              </p>

              <form onSubmit={handleCreateRestaurant} className="mt-6 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-900">
                    User Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2"
                    placeholder="newuser@example.com"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-900">
                    Restaurant Name
                  </label>
                  <input
                    type="text"
                    value={restaurantName}
                    onChange={(e) => setRestaurantName(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2"
                    placeholder="Customer Restaurant Name"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-900">
                    Setup Type
                  </label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as 'EMPTY' | 'FRONTLOAD')}
                    className="w-full rounded-xl border px-3 py-2"
                  >
                    <option value="EMPTY">Empty restaurant</option>
                    <option value="FRONTLOAD">Frontload from Flowdish template</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-slate-900 px-5 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Creating…' : 'Create Restaurant'}
                  </button>
                </div>
              </form>

              {mode === 'FRONTLOAD' ? (
                <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Frontload copies template items, supplier products, BOMs, and SOPs.
                  It does not copy live stock, deliveries, sales, waste, or forecasts.
                </div>
              ) : null}
            </section>

            {result ? (
              <section className="mt-8 rounded-2xl border border-green-300 bg-green-50 p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-green-900">
                  Created Successfully
                </h2>

                <div className="mt-4 space-y-2 text-sm text-green-900">
                  <div>
                    <span className="font-medium">Mode:</span> {result.mode}
                  </div>

                  <div>
                    <span className="font-medium">Restaurant:</span>{' '}
                    {result.restaurant?.name || 'Unknown'}
                  </div>

                  <div>
                    <span className="font-medium">Assigned user:</span>{' '}
                    {result.membership?.email || email}
                  </div>

                  <div>
                    <span className="font-medium">Role:</span>{' '}
                    {result.membership?.role || 'OWNER'}
                  </div>

                  {result.frontloadResult ? (
                    <div className="pt-2">
                      <div className="font-medium">Frontload copied:</div>
                      <div>
                        {result.frontloadResult.itemCount} item(s),{' '}
                        {result.frontloadResult.supplierProductCount} supplier product(s),{' '}
                        {result.frontloadResult.sopCount} SOP(s)
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  )
}