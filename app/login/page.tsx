'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      return
    }

    router.push('/')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md rounded-2xl border bg-white p-8 shadow"
      >
        <h1 className="text-2xl font-semibold text-slate-900">Login</h1>

        {error && (
          <div className="mt-4 text-sm text-red-600">{error}</div>
        )}

        <div className="mt-6">
          <label className="block text-sm text-slate-900">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2"
            required
          />
        </div>

        <div className="mt-4">
          <label className="block text-sm text-slate-900">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2"
            required
          />
        </div>

        <button
          type="submit"
          className="mt-6 w-full rounded-xl bg-slate-900 py-2 text-white"
        >
          Login
        </button>
      </form>
    </main>
  )
}