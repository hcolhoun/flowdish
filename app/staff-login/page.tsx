'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import CopyableError from '@/app/components/CopyableError'
import { TurnstileWidget } from '@/app/components/TurnstileWidget'

const RESTAURANT_CODE_STORAGE_KEY = 'flowdish_staff_restaurant_code'

type PinUser = {
  id: string
  displayName: string
  isAccountPin: boolean
}

async function safeJson(res: Response) {
  const text = await res.text()

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(text.slice(0, 500))
  }
}

export default function StaffLoginPage() {
  const router = useRouter()
  const pinInputRef = useRef<HTMLInputElement>(null)

  const [restaurantCode, setRestaurantCode] = useState('')
  const [restaurantName, setRestaurantName] = useState('')
  const [staffUsers, setStaffUsers] = useState<PinUser[]>([])
  const [selectedStaffUserId, setSelectedStaffUserId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingKitchen, setLoadingKitchen] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileResetKey, setTurnstileResetKey] = useState(0)

  const loadKitchen = useCallback(async (code: string) => {
    try {
      setLoadingKitchen(true)
      setError('')

      const res = await fetch(
        `/api/staff-login?restaurantCode=${encodeURIComponent(code.trim())}`,
        { cache: 'no-store' }
      )
      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to find kitchen')
      }

      const rememberedCode = String(data.restaurant?.code || code).trim()
      setRestaurantCode(rememberedCode)
      setRestaurantName(data.restaurant?.name || 'Kitchen')
      setStaffUsers(data.staffUsers || [])
      setSelectedStaffUserId('')
      setPin('')
      window.localStorage.setItem(RESTAURANT_CODE_STORAGE_KEY, rememberedCode)
    } catch (err) {
      setRestaurantName('')
      setStaffUsers([])
      setSelectedStaffUserId('')
      window.localStorage.removeItem(RESTAURANT_CODE_STORAGE_KEY)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoadingKitchen(false)
    }
  }, [])

  useEffect(() => {
    const savedCode = window.localStorage.getItem(RESTAURANT_CODE_STORAGE_KEY)?.trim()
    if (!savedCode) return

    const timeoutId = window.setTimeout(() => {
      void loadKitchen(savedCode)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loadKitchen])

  async function handleKitchenSubmit(e: React.FormEvent) {
    e.preventDefault()
    await loadKitchen(restaurantCode)
  }

  function chooseStaffUser(staffUserId: string) {
    setSelectedStaffUserId(staffUserId)
    setPin('')
    setError('')
    window.setTimeout(() => pinInputRef.current?.focus(), 0)
  }

  function changeKitchen() {
    window.localStorage.removeItem(RESTAURANT_CODE_STORAGE_KEY)
    setRestaurantCode('')
    setRestaurantName('')
    setStaffUsers([])
    setSelectedStaffUserId('')
    setPin('')
    setError('')
    setTurnstileToken('')
    setTurnstileResetKey((key) => key + 1)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    try {
      setLoading(true)
      setError('')

      const res = await fetch('/api/staff-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantCode,
          staffUserId: selectedStaffUserId,
          pin,
          turnstileToken,
        }),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        throw new Error(data?.error || 'Staff login failed')
      }

      router.push(data?.redirectTo || '/prep')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPin('')
      setTurnstileResetKey((key) => key + 1)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-sm">
        <div className="flex justify-center">
          <Image
            src="/flowdish-banner-logo.png"
            alt="Flowdish"
            width={220}
            height={70}
            priority
            className="h-16 w-auto object-contain"
          />
        </div>

        <h1 className="mt-6 text-center text-2xl font-semibold text-slate-900">
          PIN Login
        </h1>

        <p className="mt-2 text-center text-sm text-slate-600">
          Head Chef account PINs open the full restaurant account. Staff PINs open Prep and Waste.
        </p>

        {error ? (
          <CopyableError message={error} className="mt-5" />
        ) : null}

        {!restaurantName ? (
          <form onSubmit={handleKitchenSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                Restaurant Code
              </label>
              <input
                value={restaurantCode}
                onChange={(e) => setRestaurantCode(e.target.value.toLowerCase())}
                className="w-full rounded-xl border px-3 py-2"
                placeholder="restaurant-code"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loadingKitchen}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingKitchen ? 'Finding kitchen...' : 'Find Kitchen'}
            </button>
          </form>
        ) : (
          <div className="mt-6">
            <div className="flex items-start justify-between gap-4 rounded-xl border bg-slate-50 px-4 py-3">
              <div>
                <div className="font-semibold text-slate-900">{restaurantName}</div>
                <div className="mt-1 text-xs text-slate-500">{restaurantCode}</div>
              </div>
              <button
                type="button"
                onClick={changeKitchen}
                className="text-sm font-medium text-teal-700 hover:text-teal-800"
              >
                Change
              </button>
            </div>

            <h2 className="mt-5 text-sm font-semibold text-slate-900">Who is signing in?</h2>

            {staffUsers.length === 0 ? (
              <p className="mt-3 rounded-xl border px-4 py-3 text-sm text-slate-600">
                No active PIN users are set up for this kitchen.
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {staffUsers.map((staffUser) => {
                  const selected = selectedStaffUserId === staffUser.id

                  return (
                    <button
                      key={staffUser.id}
                      type="button"
                      onClick={() => chooseStaffUser(staffUser.id)}
                      className={`min-h-16 rounded-lg border px-3 py-2 text-left transition ${
                        selected
                          ? 'border-teal-600 bg-teal-50 text-teal-900'
                          : 'bg-white text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <span className="block font-medium">{staffUser.displayName}</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {staffUser.isAccountPin ? 'Full account' : 'Prep & Waste'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {selectedStaffUserId ? (
              <form onSubmit={handleSubmit} autoComplete="off" className="mt-5 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-900">
                    4 Digit PIN
                  </label>
                  <input
                    ref={pinInputRef}
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full rounded-xl border px-3 py-2 text-center text-2xl tracking-[0.5em]"
                    inputMode="numeric"
                    autoComplete="off"
                    data-1p-ignore="true"
                    data-lpignore="true"
                    maxLength={4}
                    required
                  />
                </div>

                <TurnstileWidget
                  onToken={setTurnstileToken}
                  resetKey={turnstileResetKey}
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-slate-900 px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? 'Logging in...' : 'Enter Kitchen'}
                </button>
              </form>
            ) : null}
          </div>
        )}

        <div className="mt-5 text-center text-sm">
          <a href="/login" className="font-medium text-slate-700 hover:text-slate-900">
            Head Chef / Owner login
          </a>
        </div>

        <div className="mt-3 text-center text-sm">
          <a href="/privacy" className="font-medium text-slate-700 underline hover:text-slate-900">
            Privacy statement
          </a>
        </div>
      </div>
    </main>
  )
}   
