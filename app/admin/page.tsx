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

type ColdStorageAdminMonitor = {
  id: string
  restaurantId: string
  name: string
  location: string | null
  storageType: string
  deviceKey: string
  active: boolean
  minTempC: number | null
  maxTempC: number | null
  createdAt: string
  restaurant: {
    id: string
    name: string
  }
  readings: Array<{
    id: string
    temperatureC: number
    recordedAt: string
  }>
}

type ColdStorageAdminResponse = {
  restaurants: Array<{
    id: string
    name: string
    plan: 'BASIC' | 'PREMIUM'
  }>
  monitors: ColdStorageAdminMonitor[]
}

type SupplierCreditConfig = {
  id: string
  supplier: string
  supplierEmail: string
  ccEmail: string | null
  enabled: boolean
  firstFollowUpDays: number
  repeatEveryDays: number
  maxFollowUps: number
}

type SupplierCreditClaim = {
  id: string
  supplier: string
  supplierSku: string | null
  productName: string
  qty: number | null
  unitType: string | null
  chargedAmount: number | null
  docketNumber: string | null
  chargedAt: string
  notes: string | null
  status: 'OPEN' | 'CREDIT_RECEIVED' | 'CLOSED'
  followUpCount: number
  nextFollowUpAt: string | null
  lastFollowUpAt: string | null
  lastEmailError: string | null
  createdAt: string
}

type SupplierCreditAdminResponse = {
  configs: SupplierCreditConfig[]
  claims: SupplierCreditClaim[]
  emailServiceConfigured: boolean
}

type VatReport = {
  startDate: string
  endDate: string
  summary: {
    grossPurchases: number
    totalVatCharged: number
    vatClaimed: number
    vatNotClaimed: number
    vatEligible: number
    zeroRatedDeliveryCount: number
  }
  rows: Array<{
    id: string
    deliveredAt: string
    supplier: string | null
    itemSku: string
    itemName: string
    grossAmount: number
    vatRatePercent: number
    vatAmount: number
    netAmount: number
    vatReclaimStatus: 'NOT_APPLICABLE' | 'ELIGIBLE' | 'CLAIMED' | 'NOT_CLAIMED'
  }>
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
  const [editingStaffId, setEditingStaffId] = useState('')
  const [editingStaffDisplayName, setEditingStaffDisplayName] = useState('')
  const [editingStaffPin, setEditingStaffPin] = useState('')
  const [updatingStaffId, setUpdatingStaffId] = useState('')
  const [removingStaffId, setRemovingStaffId] = useState('')
  const [accountPinDisplayName, setAccountPinDisplayName] = useState('')
  const [accountPin, setAccountPin] = useState('')
  const [accountPinResult, setAccountPinResult] = useState<AccountPinResult | null>(null)

  const [restaurants, setRestaurants] = useState<AdminRestaurant[]>([])
  const [templateL0s, setTemplateL0s] = useState<TemplateL0[]>([])
  const [aiUsage, setAiUsage] = useState<AiUsageResponse | null>(null)
  const [loadingAiUsage, setLoadingAiUsage] = useState(false)
  const [coldStorageAdmin, setColdStorageAdmin] = useState<ColdStorageAdminResponse | null>(null)
  const [loadingColdStorageAdmin, setLoadingColdStorageAdmin] = useState(false)
  const [supplierCreditAdmin, setSupplierCreditAdmin] =
    useState<SupplierCreditAdminResponse | null>(null)
  const [loadingSupplierCredits, setLoadingSupplierCredits] = useState(false)
  const [savingSupplierCreditConfig, setSavingSupplierCreditConfig] = useState(false)
  const [updatingSupplierCreditClaimId, setUpdatingSupplierCreditClaimId] = useState('')
  const [supplierCreditConfigForm, setSupplierCreditConfigForm] = useState({
    supplier: '',
    supplierEmail: '',
    ccEmail: '',
    enabled: false,
    firstFollowUpDays: '3',
    repeatEveryDays: '3',
    maxFollowUps: '5',
  })
  const currentYear = new Date().getFullYear()
  const [vatReport, setVatReport] = useState<VatReport | null>(null)
  const [vatStartDate, setVatStartDate] = useState(`${currentYear}-01-01`)
  const [vatEndDate, setVatEndDate] = useState(`${currentYear}-12-31`)
  const [loadingVatReport, setLoadingVatReport] = useState(false)
  const [savingColdStorageMonitor, setSavingColdStorageMonitor] = useState(false)
  const [newColdStorageMonitor, setNewColdStorageMonitor] = useState({
    restaurantId: '',
    name: '',
    location: '',
    storageType: 'FRIDGE',
    minTempC: '0',
    maxTempC: '5',
  })
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

  async function loadColdStorageAdmin() {
    try {
      setLoadingColdStorageAdmin(true)
      const res = await fetch('/api/admin/cold-storage-monitors', { cache: 'no-store' })
      const json = await safeJson(res)

      if (!res.ok) {
        throw new Error(json?.error || 'Failed to load cold storage monitors')
      }

      setColdStorageAdmin(json)

      if (!newColdStorageMonitor.restaurantId && json.restaurants?.[0]?.id) {
        setNewColdStorageMonitor((current) => ({
          ...current,
          restaurantId: json.restaurants[0].id,
        }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoadingColdStorageAdmin(false)
    }
  }

  async function loadSupplierCredits() {
    try {
      setLoadingSupplierCredits(true)
      const res = await fetch('/api/admin/supplier-credit-followups', {
        cache: 'no-store',
      })
      const json = await safeJson(res)

      if (!res.ok) {
        throw new Error(json?.error || 'Failed to load supplier credit follow-ups')
      }

      setSupplierCreditAdmin(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoadingSupplierCredits(false)
    }
  }

  async function loadVatReport(
    nextStartDate = vatStartDate,
    nextEndDate = vatEndDate
  ) {
    try {
      setLoadingVatReport(true)
      const params = new URLSearchParams({
        startDate: nextStartDate,
        endDate: nextEndDate,
      })
      const res = await fetch(`/api/admin/vat-report?${params.toString()}`, {
        cache: 'no-store',
      })
      const json = await safeJson(res)

      if (!res.ok) {
        throw new Error(json?.error || 'Failed to load VAT report')
      }

      setVatReport(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoadingVatReport(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (data?.permissions.canCreateRestaurants) {
      loadFrontloadData()
      loadAiUsage()
      loadColdStorageAdmin()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.permissions.canCreateRestaurants])

  useEffect(() => {
    if (data?.permissions.canManageRestaurantMembers) {
      loadSupplierCredits()
      loadVatReport()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.permissions.canManageRestaurantMembers])

  async function saveSupplierCreditConfig(e: React.FormEvent) {
    e.preventDefault()

    try {
      setSavingSupplierCreditConfig(true)
      setError('')
      setMessage('')

      const res = await fetch('/api/admin/supplier-credit-followups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(supplierCreditConfigForm),
      })
      const json = await safeJson(res)

      if (!res.ok) {
        throw new Error(json?.error || 'Failed to save supplier follow-up configuration')
      }

      setMessage('Supplier credit follow-up configuration saved.')
      setSupplierCreditConfigForm({
        supplier: '',
        supplierEmail: '',
        ccEmail: '',
        enabled: false,
        firstFollowUpDays: '3',
        repeatEveryDays: '3',
        maxFollowUps: '5',
      })
      await loadSupplierCredits()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSavingSupplierCreditConfig(false)
    }
  }

  async function updateSupplierCreditClaim(
    id: string,
    status: SupplierCreditClaim['status']
  ) {
    try {
      setUpdatingSupplierCreditClaimId(id)
      setError('')
      setMessage('')

      const res = await fetch('/api/supplier-credit-claims', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const json = await safeJson(res)

      if (!res.ok) {
        throw new Error(json?.error || 'Failed to update supplier credit claim')
      }

      setMessage(
        status === 'CREDIT_RECEIVED'
          ? 'Claim marked as credit received. Automatic follow-ups stopped.'
          : status === 'CLOSED'
            ? 'Claim closed. Automatic follow-ups stopped.'
            : 'Claim reopened.'
      )
      await loadSupplierCredits()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setUpdatingSupplierCreditClaimId('')
    }
  }

  async function handleCreateColdStorageMonitor(e: React.FormEvent) {
    e.preventDefault()

    try {
      setSavingColdStorageMonitor(true)
      setError('')
      setMessage('')

      const res = await fetch('/api/admin/cold-storage-monitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newColdStorageMonitor,
          minTempC: newColdStorageMonitor.minTempC,
          maxTempC: newColdStorageMonitor.maxTempC,
        }),
      })

      const json = await safeJson(res)

      if (!res.ok) {
        throw new Error(json?.error || 'Failed to create cold storage monitor')
      }

      setMessage('Cold storage monitor created. Use its device key in the webhook.')
      setNewColdStorageMonitor((current) => ({
        ...current,
        name: '',
        location: '',
      }))
      await loadColdStorageAdmin()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSavingColdStorageMonitor(false)
    }
  }

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

  function startEditStaff(staff: StaffUser) {
    setEditingStaffId(staff.id)
    setEditingStaffDisplayName(staff.displayName)
    setEditingStaffPin('')
    setError('')
    setMessage('')
  }

  function cancelEditStaff() {
    setEditingStaffId('')
    setEditingStaffDisplayName('')
    setEditingStaffPin('')
  }

  async function handleUpdateStaffUser(staffId: string) {
    try {
      setUpdatingStaffId(staffId)
      setError('')
      setMessage('')

      const res = await fetch(`/api/admin/staff-users/${staffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: editingStaffDisplayName,
          pin: editingStaffPin,
        }),
      })
      const json = await safeJson(res)

      if (!res.ok) {
        throw new Error(json?.error || 'Failed to update staff PIN user')
      }

      setMessage('Staff PIN user updated.')
      cancelEditStaff()
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setUpdatingStaffId('')
    }
  }

  async function handleRemoveStaffUser(staff: StaffUser) {
    try {
      const confirmed = window.confirm(`Remove staff PIN user ${staff.displayName}?`)
      if (!confirmed) return

      setRemovingStaffId(staff.id)
      setError('')
      setMessage('')

      const res = await fetch(`/api/admin/staff-users/${staff.id}`, {
        method: 'DELETE',
      })
      const json = await safeJson(res)

      if (!res.ok) {
        throw new Error(json?.error || 'Failed to remove staff PIN user')
      }

      setMessage('Staff PIN user removed.')
      if (editingStaffId === staff.id) cancelEditStaff()
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setRemovingStaffId('')
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

  const coldStorageIngestUrl = 'https://www.flowdish.ie/api/cold-storage/readings/ingest'

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
                loadColdStorageAdmin()
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

            {data.currentUser.isSystemOwner ? (
              <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">
                      Cold Storage Monitors
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Assign Sonoff/WTS01 temperature monitors to restaurant accounts.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={loadColdStorageAdmin}
                    disabled={loadingColdStorageAdmin}
                    className="rounded-xl border px-4 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    {loadingColdStorageAdmin ? 'Loading...' : 'Refresh Monitors'}
                  </button>
                </div>

                <form
                  onSubmit={handleCreateColdStorageMonitor}
                  className="mt-6 grid gap-4 md:grid-cols-3"
                >
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-900">
                      Restaurant
                    </label>
                    <select
                      value={newColdStorageMonitor.restaurantId}
                      onChange={(e) =>
                        setNewColdStorageMonitor({
                          ...newColdStorageMonitor,
                          restaurantId: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border px-3 py-2"
                      required
                    >
                      <option value="">Select restaurant</option>
                      {(coldStorageAdmin?.restaurants || restaurants).map((restaurant) => (
                        <option key={restaurant.id} value={restaurant.id}>
                          {restaurant.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-900">
                      Monitor Name
                    </label>
                    <input
                      value={newColdStorageMonitor.name}
                      onChange={(e) =>
                        setNewColdStorageMonitor({
                          ...newColdStorageMonitor,
                          name: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border px-3 py-2"
                      placeholder="Fridge 1"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-900">
                      Location
                    </label>
                    <input
                      value={newColdStorageMonitor.location}
                      onChange={(e) =>
                        setNewColdStorageMonitor({
                          ...newColdStorageMonitor,
                          location: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border px-3 py-2"
                      placeholder="Main kitchen"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-900">
                      Storage Type
                    </label>
                    <select
                      value={newColdStorageMonitor.storageType}
                      onChange={(e) =>
                        setNewColdStorageMonitor({
                          ...newColdStorageMonitor,
                          storageType: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border px-3 py-2"
                    >
                      <option value="FRIDGE">Fridge</option>
                      <option value="FREEZER">Freezer</option>
                      <option value="BLAST_CHILLER">Blast chiller</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-900">
                      Min Temp °C
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={newColdStorageMonitor.minTempC}
                      onChange={(e) =>
                        setNewColdStorageMonitor({
                          ...newColdStorageMonitor,
                          minTempC: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-900">
                      Max Temp °C
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={newColdStorageMonitor.maxTempC}
                      onChange={(e) =>
                        setNewColdStorageMonitor({
                          ...newColdStorageMonitor,
                          maxTempC: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border px-3 py-2"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={savingColdStorageMonitor}
                      className="rounded-xl bg-slate-900 px-5 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingColdStorageMonitor ? 'Creating...' : 'Create Monitor'}
                    </button>
                  </div>
                </form>

                <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  Webhook URL for IFTTT:{' '}
                  <span className="font-mono">{coldStorageIngestUrl}</span>
                </div>

                <div className="mt-5 overflow-hidden rounded-xl border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="px-4 py-3">Restaurant</th>
                        <th className="px-4 py-3">Monitor</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Range</th>
                        <th className="px-4 py-3">Device Key</th>
                        <th className="px-4 py-3">Latest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coldStorageAdmin?.monitors.length ? (
                        coldStorageAdmin.monitors.map((monitor) => (
                          <tr key={monitor.id} className="border-t align-top">
                            <td className="px-4 py-3">{monitor.restaurant.name}</td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900">{monitor.name}</div>
                              <div className="text-xs text-slate-500">{monitor.location || ''}</div>
                            </td>
                            <td className="px-4 py-3">{monitor.storageType}</td>
                            <td className="px-4 py-3">
                              {monitor.minTempC ?? '—'}°C to {monitor.maxTempC ?? '—'}°C
                            </td>
                            <td className="px-4 py-3">
                              <code className="break-all rounded bg-slate-100 px-2 py-1 text-xs">
                                {monitor.deviceKey}
                              </code>
                            </td>
                            <td className="px-4 py-3">
                              {monitor.readings[0]
                                ? `${monitor.readings[0].temperatureC.toFixed(1)}°C · ${formatDate(
                                    monitor.readings[0].recordedAt
                                  )}`
                                : 'No reading'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr className="border-t">
                          <td className="px-4 py-3 text-slate-600" colSpan={6}>
                            No cold storage monitors created yet.
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
              <h2 className="text-xl font-semibold text-slate-900">Head Chef PIN Login</h2>
              <p className="mt-1 text-sm text-slate-600">
                This gives the account user a quick PIN login with the same access as their email
                login. It does not use one of the Basic plan staff PIN slots.
              </p>

              {data.accountPin ? (
                <div className="mt-5 rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Current PIN username:{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {data.accountPin.username}
                  </span>
                </div>
              ) : null}

              <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                To recover or change the Head Chef PIN, enter a new 4-digit PIN below and save it.
              </div>

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
                    {savingAccountPin
                      ? 'Saving...'
                      : data.accountPin
                        ? 'Reset Head Chef PIN'
                        : 'Create Head Chef PIN'}
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
                Staff PIN users can only access Prep and Waste. Basic includes 3 staff PIN users
                plus the account PIN above.
              </p>

              <div className="mt-5 overflow-hidden rounded-xl border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-4 py-3">Display Name</th>
                      <th className="px-4 py-3">Username</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffPinUsers.length === 0 ? (
                      <tr>
                        <td className="px-4 py-3 text-slate-600" colSpan={5}>
                          No staff PIN users yet.
                        </td>
                      </tr>
                    ) : (
                      staffPinUsers.map((staff) => {
                        const isEditing = editingStaffId === staff.id

                        return (
                          <tr key={staff.id} className="border-t align-top">
                            <td className="px-4 py-3">
                              {isEditing ? (
                                <input
                                  value={editingStaffDisplayName}
                                  onChange={(e) => setEditingStaffDisplayName(e.target.value)}
                                  className="w-40 rounded-lg border px-2 py-1 text-sm"
                                />
                              ) : (
                                staff.displayName
                              )}
                            </td>
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
                              {isEditing ? (
                                <div className="mt-2">
                                  <label className="mb-1 block text-xs font-medium text-slate-700">
                                    New PIN
                                  </label>
                                  <input
                                    value={editingStaffPin}
                                    onChange={(e) =>
                                      setEditingStaffPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                                    }
                                    className="w-24 rounded-lg border px-2 py-1 text-sm"
                                    inputMode="numeric"
                                    maxLength={4}
                                    placeholder="1234"
                                  />
                                  <div className="mt-1 text-xs text-slate-500">
                                    Leave blank to keep current PIN.
                                  </div>
                                </div>
                              ) : null}
                            </td>
                            <td className="px-4 py-3">{formatDate(staff.createdAt)}</td>
                            <td className="px-4 py-3">
                              {isEditing ? (
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateStaffUser(staff.id)}
                                    disabled={updatingStaffId === staff.id}
                                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {updatingStaffId === staff.id ? 'Saving...' : 'Save'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditStaff}
                                    disabled={updatingStaffId === staff.id}
                                    className="rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => startEditStaff(staff)}
                                    disabled={!staff.active || Boolean(removingStaffId)}
                                    className="rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Edit PIN
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveStaffUser(staff)}
                                    disabled={!staff.active || removingStaffId === staff.id}
                                    className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {removingStaffId === staff.id ? 'Removing...' : 'Remove'}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })
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

            <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Delivery VAT Report</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    VAT charged on delivery lines, including claimed, unclaimed, and eligible amounts.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-[160px_160px_auto] sm:items-end">
                  <label className="text-sm font-medium text-slate-900">
                    Start Date
                    <input
                      type="date"
                      value={vatStartDate}
                      onChange={(e) => setVatStartDate(e.target.value)}
                      className="mt-1 w-full rounded-xl border px-3 py-2"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-900">
                    End Date
                    <input
                      type="date"
                      value={vatEndDate}
                      onChange={(e) => setVatEndDate(e.target.value)}
                      className="mt-1 w-full rounded-xl border px-3 py-2"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => loadVatReport()}
                    disabled={loadingVatReport}
                    className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingVatReport ? 'Loading...' : 'Apply'}
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">VAT Charged</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">
                    {money(vatReport?.summary.totalVatCharged ?? 0)}
                  </div>
                </div>
                <div className="rounded-xl border border-green-300 bg-green-50 p-4">
                  <div className="text-xs text-green-800">Claimed</div>
                  <div className="mt-1 text-xl font-semibold text-green-900">
                    {money(vatReport?.summary.vatClaimed ?? 0)}
                  </div>
                </div>
                <div className="rounded-xl border border-blue-300 bg-blue-50 p-4">
                  <div className="text-xs text-blue-800">Eligible / Outstanding</div>
                  <div className="mt-1 text-xl font-semibold text-blue-900">
                    {money(vatReport?.summary.vatEligible ?? 0)}
                  </div>
                </div>
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                  <div className="text-xs text-amber-800">Not Claimed</div>
                  <div className="mt-1 text-xl font-semibold text-amber-900">
                    {money(vatReport?.summary.vatNotClaimed ?? 0)}
                  </div>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Zero-rated Lines</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">
                    {vatReport?.summary.zeroRatedDeliveryCount ?? 0}
                  </div>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="min-w-[1050px] w-full text-left text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Supplier</th>
                      <th className="px-3 py-2">Delivery Item</th>
                      <th className="px-3 py-2">Gross</th>
                      <th className="px-3 py-2">VAT Rate</th>
                      <th className="px-3 py-2">VAT</th>
                      <th className="px-3 py-2">Net</th>
                      <th className="px-3 py-2">Treatment</th>
                      <th className="px-3 py-2">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!vatReport?.rows.length ? (
                      <tr className="border-t">
                        <td colSpan={9} className="px-3 py-3 text-slate-600">
                          No delivery VAT records in this period.
                        </td>
                      </tr>
                    ) : (
                      vatReport.rows.map((row) => (
                        <tr key={row.id} className="border-t">
                          <td className="px-3 py-2">{formatDate(row.deliveredAt)}</td>
                          <td className="px-3 py-2">{row.supplier || 'Unknown'}</td>
                          <td className="px-3 py-2">
                            {row.itemName} [{row.itemSku}]
                          </td>
                          <td className="px-3 py-2">{money(row.grossAmount)}</td>
                          <td className="px-3 py-2">{row.vatRatePercent}%</td>
                          <td className="px-3 py-2">{money(row.vatAmount)}</td>
                          <td className="px-3 py-2">{money(row.netAmount)}</td>
                          <td className="px-3 py-2">
                            {row.vatReclaimStatus.replaceAll('_', ' ')}
                          </td>
                          <td className="px-3 py-2">
                            <a
                              href={`/deliveries#delivery-${row.id}`}
                              className="font-medium text-blue-700 underline hover:text-blue-900"
                            >
                              View delivery
                            </a>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    Supplier Credits & Follow-ups
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Manage items charged but not received and supplier reminder emails.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadSupplierCredits}
                  disabled={loadingSupplierCredits}
                  className="rounded-xl border px-4 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingSupplierCredits ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              {supplierCreditAdmin && !supplierCreditAdmin.emailServiceConfigured ? (
                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Automatic email sending is not connected yet. Claims will still be recorded.
                  Add the Resend email settings in Vercel before enabling supplier reminders.
                </div>
              ) : null}

              <form
                onSubmit={saveSupplierCreditConfig}
                className="mt-6 grid gap-4 rounded-xl border bg-slate-50 p-4 md:grid-cols-4"
              >
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-900">
                    Supplier
                  </label>
                  <input
                    value={supplierCreditConfigForm.supplier}
                    onChange={(e) =>
                      setSupplierCreditConfigForm((current) => ({
                        ...current,
                        supplier: e.target.value,
                      }))
                    }
                    list="supplier-credit-names"
                    className="w-full rounded-xl border bg-white px-3 py-2"
                    required
                  />
                  <datalist id="supplier-credit-names">
                    {Array.from(
                      new Set(
                        (supplierCreditAdmin?.claims || []).map((claim) => claim.supplier)
                      )
                    ).map((supplier) => (
                      <option key={supplier} value={supplier} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-900">
                    Supplier Email
                  </label>
                  <input
                    type="email"
                    value={supplierCreditConfigForm.supplierEmail}
                    onChange={(e) =>
                      setSupplierCreditConfigForm((current) => ({
                        ...current,
                        supplierEmail: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border bg-white px-3 py-2"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-900">
                    CC Email
                  </label>
                  <input
                    type="email"
                    value={supplierCreditConfigForm.ccEmail}
                    onChange={(e) =>
                      setSupplierCreditConfigForm((current) => ({
                        ...current,
                        ccEmail: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border bg-white px-3 py-2"
                  />
                </div>

                <label className="flex items-center gap-3 self-end rounded-xl border bg-white px-3 py-2">
                  <input
                    type="checkbox"
                    checked={supplierCreditConfigForm.enabled}
                    onChange={(e) =>
                      setSupplierCreditConfigForm((current) => ({
                        ...current,
                        enabled: e.target.checked,
                      }))
                    }
                  />
                  <span className="text-sm font-medium text-slate-900">Automatic follow-ups</span>
                </label>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-900">
                    First Follow-up (days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={supplierCreditConfigForm.firstFollowUpDays}
                    onChange={(e) =>
                      setSupplierCreditConfigForm((current) => ({
                        ...current,
                        firstFollowUpDays: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border bg-white px-3 py-2"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-900">
                    Repeat Every (days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={supplierCreditConfigForm.repeatEveryDays}
                    onChange={(e) =>
                      setSupplierCreditConfigForm((current) => ({
                        ...current,
                        repeatEveryDays: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border bg-white px-3 py-2"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-900">
                    Maximum Follow-ups
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={supplierCreditConfigForm.maxFollowUps}
                    onChange={(e) =>
                      setSupplierCreditConfigForm((current) => ({
                        ...current,
                        maxFollowUps: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border bg-white px-3 py-2"
                    required
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={savingSupplierCreditConfig}
                    className="rounded-xl bg-slate-900 px-5 py-2.5 text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingSupplierCreditConfig ? 'Saving...' : 'Save Supplier Settings'}
                  </button>
                </div>
              </form>

              {supplierCreditAdmin?.configs.length ? (
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-3 py-2">Supplier</th>
                        <th className="px-3 py-2">Email</th>
                        <th className="px-3 py-2">Schedule</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplierCreditAdmin.configs.map((config) => (
                        <tr key={config.id} className="border-t">
                          <td className="px-3 py-2">{config.supplier}</td>
                          <td className="px-3 py-2">{config.supplierEmail}</td>
                          <td className="px-3 py-2">
                            Day {config.firstFollowUpDays}, then every {config.repeatEveryDays} day(s),
                            max {config.maxFollowUps}
                          </td>
                          <td className="px-3 py-2">
                            {config.enabled ? 'Enabled' : 'Disabled'}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() =>
                                setSupplierCreditConfigForm({
                                  supplier: config.supplier,
                                  supplierEmail: config.supplierEmail,
                                  ccEmail: config.ccEmail || '',
                                  enabled: config.enabled,
                                  firstFollowUpDays: String(config.firstFollowUpDays),
                                  repeatEveryDays: String(config.repeatEveryDays),
                                  maxFollowUps: String(config.maxFollowUps),
                                })
                              }
                              className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <div className="mt-8 overflow-x-auto">
                <table className="min-w-[1100px] w-full text-left text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-3 py-2">Supplier</th>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2">Docket</th>
                      <th className="px-3 py-2">Charged</th>
                      <th className="px-3 py-2">Follow-ups</th>
                      <th className="px-3 py-2">Next Due</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!supplierCreditAdmin?.claims.length ? (
                      <tr className="border-t">
                        <td colSpan={8} className="px-3 py-3 text-slate-600">
                          No charged-but-not-received claims recorded.
                        </td>
                      </tr>
                    ) : (
                      supplierCreditAdmin.claims.map((claim) => (
                        <tr key={claim.id} className="border-t align-top">
                          <td className="px-3 py-2">{claim.supplier}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{claim.productName}</div>
                            <div className="text-xs text-slate-500">
                              {claim.supplierSku || 'No SKU'} ·{' '}
                              {claim.qty === null
                                ? 'Qty not recorded'
                                : `${claim.qty} ${claim.unitType || ''}`}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {claim.docketNumber || 'N/A'} · {formatDate(claim.chargedAt)}
                          </td>
                          <td className="px-3 py-2">{money(claim.chargedAmount)}</td>
                          <td className="px-3 py-2">{claim.followUpCount}</td>
                          <td className="px-3 py-2">
                            {claim.nextFollowUpAt ? formatDate(claim.nextFollowUpAt) : 'Not scheduled'}
                            {claim.lastEmailError ? (
                              <div className="mt-1 max-w-64 text-xs text-red-700">
                                Last send failed
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">{claim.status.replaceAll('_', ' ')}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              {claim.status === 'OPEN' ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateSupplierCreditClaim(claim.id, 'CREDIT_RECEIVED')
                                    }
                                    disabled={updatingSupplierCreditClaimId === claim.id}
                                    className="rounded-lg border border-green-400 px-2 py-1 text-xs text-green-800 hover:bg-green-50 disabled:opacity-50"
                                  >
                                    Credit Received
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateSupplierCreditClaim(claim.id, 'CLOSED')
                                    }
                                    disabled={updatingSupplierCreditClaimId === claim.id}
                                    className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                                  >
                                    Close
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => updateSupplierCreditClaim(claim.id, 'OPEN')}
                                  disabled={updatingSupplierCreditClaimId === claim.id}
                                  className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Reopen
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
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
