'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TurnstileWidget } from '@/app/components/TurnstileWidget'
import { createClient } from '@/lib/supabase'
import { verifyTurnstileBeforeSubmit } from '@/lib/turnstile-client'

export default function SignupPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileResetKey, setTurnstileResetKey] = useState(0)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()

    try {
      setLoading(true)
      setError('')
      setMessage('')

      const cleanEmail = email.trim().toLowerCase()

      if (!cleanEmail) {
        setError('Email is required.')
        return
      }

      if (password.length < 8) {
        setError('Password must be at least 8 characters.')
        return
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }

      await verifyTurnstileBeforeSubmit(turnstileToken)

      const supabase = createClient()

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      })

      if (error) {
        throw error
      }

      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setError('An account already exists for this email. Please log in instead.')
        return
      }

      setMessage(
        'Account created. Check your email to confirm your account, then log in. If email confirmation is disabled, you can log in now.'
      )

      setTimeout(() => {
        router.push('/login')
      }, 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account.')
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
          Head Chef Sign Up
        </h1>

        <p className="mt-2 text-center text-sm text-slate-600">
          Create your Flowdish owner account. Your restaurant account will be activated by Flowdish.
        </p>

        {error ? (
          <div className="mt-5 whitespace-pre-wrap rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="mt-5 whitespace-pre-wrap rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
            {message}
          </div>
        ) : null}

        <form onSubmit={handleSignup} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              placeholder="chef@example.com"
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
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              placeholder="Minimum 8 characters"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              placeholder="Repeat password"
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
            {loading ? 'Creating account…' : 'Create Head Chef Account'}
          </button>
        </form>

        <div className="mt-5 flex justify-between text-sm">
          <Link href="/login" className="font-medium text-slate-700 hover:text-slate-900">
            Already have an account?
          </Link>

          <Link href="/staff-login" className="font-medium text-slate-700 hover:text-slate-900">
            Staff PIN login
          </Link>
        </div>

        <div className="mt-3 text-center text-sm">
          <Link href="/privacy" className="font-medium text-slate-700 underline hover:text-slate-900">
            Privacy statement
          </Link>
        </div>
      </div>
    </main>
  )
}
