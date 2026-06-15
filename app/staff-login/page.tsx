'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { TurnstileWidget } from '@/app/components/TurnstileWidget'

export default function StaffLoginPage() {
  const router = useRouter()

  const [restaurantCode, setRestaurantCode] = useState('')
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileResetKey, setTurnstileResetKey] = useState(0)

  async function safeJson(res: Response) {
    const text = await res.text()

    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text.slice(0, 500))
    }
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
          username,
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
          <div className="mt-5 whitespace-pre-wrap rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              Restaurant Code
            </label>
            <input
              value={restaurantCode}
              onChange={(e) => setRestaurantCode(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              placeholder="restaurant-code"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              className="w-full rounded-xl border px-3 py-2"
              placeholder="chef-john"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              4 Digit PIN
            </label>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full rounded-xl border px-3 py-2 text-center text-2xl tracking-[0.5em]"
              placeholder="1234"
              inputMode="numeric"
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
            {loading ? 'Logging in…' : 'Enter Kitchen'}
          </button>
        </form>

        <div className="mt-5 text-center text-sm">
          <a href="/login" className="font-medium text-slate-700 hover:text-slate-900">
            Head Chef / Owner login
          </a>
        </div>
      </div>
    </main>
  )
}   
