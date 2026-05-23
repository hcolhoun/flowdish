'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetSending, setResetSending] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()

    try {
      setError('')
      setMessage('')
      setLoading(true)

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
          <h1 className="text-3xl font-semibold text-slate-900">Flowdish</h1>
          <p className="mt-2 text-sm text-slate-600">Sign in to continue.</p>
        </div>

        {error ? (
          <div className="mt-4 whitespace-pre-wrap rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="mt-4 whitespace-pre-wrap rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
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

          <button
            type="submit"
            disabled={loading || resetSending}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-5 flex flex-col gap-2 text-center text-sm">
          <a
            href="/signup"
            className="font-medium text-slate-700 underline hover:text-slate-900"
          >
            Head Chef sign up
          </a>

          <a
            href="/staff-login"
            className="font-medium text-slate-700 underline hover:text-slate-900"
          >
            Staff PIN login
          </a>
        </div>
      </div>
    </main>
  )
}