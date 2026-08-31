'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import CopyableError from '@/app/components/CopyableError'
import BrandLogo from '@/app/components/BrandLogo'
import { TurnstileWidget } from '@/app/components/TurnstileWidget'
import { verifyTurnstileBeforeSubmit } from '@/lib/turnstile-client'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetSending, setResetSending] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileResetKey, setTurnstileResetKey] = useState(0)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()

    try {
      setError('')
      setMessage('')
      setLoading(true)

      await verifyTurnstileBeforeSubmit(turnstileToken)

      const supabase = createClient()

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        throw new Error(error.message)
      }

      router.push('/')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setTurnstileResetKey((key) => key + 1)
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword() {
    try {
      setError('')
      setMessage('')
      setResetSending(true)

      if (!email.trim()) {
        throw new Error('Enter your email address first.')
      }

      const supabase = createClient()

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) {
        throw new Error(error.message)
      }

      setMessage('Password reset email sent. Check your inbox.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setResetSending(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <div className="text-center">
          <div className="flex justify-center">
            <BrandLogo className="h-[68px] w-56" priority />
          </div>

          <p className="mt-4 text-sm text-slate-600">Sign in to continue.</p>
        </div>

        {error ? (
          <CopyableError message={error} className="mt-4" />
        ) : null}

        {message ? (
          <div className="sticky top-4 z-40 mt-4 whitespace-pre-wrap rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700 shadow-sm">
            {message}
          </div>
        ) : null}

        <form onSubmit={handleLogin} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError('')
                setMessage('')
              }}
              className="w-full rounded-xl border px-3 py-2"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError('')
                setMessage('')
              }}
              className="w-full rounded-xl border px-3 py-2"
              autoComplete="current-password"
              required
            />
          </div>

          <div className="text-right">
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={resetSending || loading}
              className="text-sm font-medium text-slate-700 underline hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resetSending ? 'Sending reset email...' : 'Forgot password?'}
            </button>
          </div>

          <TurnstileWidget
            onToken={setTurnstileToken}
            resetKey={turnstileResetKey}
          />

          <button
            type="submit"
            disabled={loading || resetSending}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-5 flex flex-col gap-2 text-center text-sm">
          <Link
            href="/signup"
            className="font-medium text-slate-700 underline hover:text-slate-900"
          >
            Head Chef sign up
          </Link>

          <Link
            href="/staff-login"
            className="font-medium text-slate-700 underline hover:text-slate-900"
          >
            Staff PIN login
          </Link>

          <Link
            href="/privacy"
            className="font-medium text-slate-700 underline hover:text-slate-900"
          >
            Privacy statement
          </Link>
        </div>
      </div>
    </main>
  )
}
