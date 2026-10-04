'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import CopyableError from '@/app/components/CopyableError'
import BrandLogo from '@/app/components/BrandLogo'
import { TurnstileWidget } from '@/app/components/TurnstileWidget'
import { FLOWDISH_PLANS, type FlowdishPlanId } from '@/lib/plans'
import { LEGAL_VERSIONS, planUsesAi } from '@/lib/legal'
import { createClient } from '@/lib/supabase'
import { verifyTurnstileBeforeSubmit } from '@/lib/turnstile-client'

export default function SignupPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [selectedPlan, setSelectedPlan] = useState<FlowdishPlanId | ''>('')
  const [businessLegalName, setBusinessLegalName] = useState('')
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [aiProcessingAccepted, setAiProcessingAccepted] = useState(false)
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

      if (!selectedPlan) {
        setError('Choose a Flowdish plan to continue.')
        return
      }

      if (!businessLegalName.trim()) {
        setError('Business legal name is required.')
        return
      }

      if (!legalAccepted) {
        setError('Accept the Flowdish terms and data processing agreement to continue.')
        return
      }

      if (planUsesAi(selectedPlan) && !aiProcessingAccepted) {
        setError('Accept the Enterprise AI processing notice to continue.')
        return
      }

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
      const acceptedAt = new Date().toISOString()
      const usesAi = planUsesAi(selectedPlan)

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: {
            requested_plan: selectedPlan,
            business_legal_name: businessLegalName.trim(),
            authority_confirmed: true,
            legal_accepted_at: acceptedAt,
            terms_version: LEGAL_VERSIONS.terms,
            dpa_version: LEGAL_VERSIONS.dpa,
            privacy_version: LEGAL_VERSIONS.privacy,
            ai_processing_accepted: usesAi && aiProcessingAccepted,
            ai_notice_version: usesAi ? LEGAL_VERSIONS.aiNotice : null,
          },
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
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex justify-center">
          <BrandLogo className="h-16 w-[202px]" priority transparentLight />
        </div>

        <h1 className="mt-5 text-center text-3xl font-semibold text-slate-900">
          Head Chef Sign Up
        </h1>

        <p className="mx-auto mt-2 max-w-2xl text-center text-sm leading-6 text-slate-600">
          Choose the plan that fits your kitchen, then create your Flowdish owner account.
          Payment will be arranged before your plan is activated.
        </p>

        <form onSubmit={handleSignup} className="mt-8">
          <fieldset>
            <legend className="sr-only">Choose your Flowdish plan</legend>
            <div className="grid gap-4 lg:grid-cols-3">
              {FLOWDISH_PLANS.map((plan) => {
                const isSelected = selectedPlan === plan.id

                return (
                  <label
                    key={plan.id}
                    className={`relative flex min-h-full cursor-pointer flex-col rounded-lg border-2 bg-white p-5 shadow-sm transition hover:border-slate-400 ${
                      isSelected
                        ? 'border-emerald-600 ring-2 ring-emerald-100'
                        : 'border-slate-200'
                    }`}
                  >
                    {'recommended' in plan && plan.recommended ? (
                      <span className="absolute right-4 top-4 rounded bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">
                        Recommended
                      </span>
                    ) : null}

                    <span className="flex items-start gap-3 pr-24">
                      <input
                        type="radio"
                        name="flowdish-plan"
                        value={plan.id}
                        checked={isSelected}
                        onChange={() => setSelectedPlan(plan.id)}
                        className="mt-1 h-4 w-4 shrink-0 accent-emerald-700"
                        required
                      />
                      <span className="text-lg font-semibold text-slate-900">{plan.name}</span>
                    </span>

                    <span className="mt-4 text-sm leading-6 text-slate-600">{plan.summary}</span>
                    <span className="mt-4 flex items-end gap-1 text-slate-900">
                      <span className="text-3xl font-semibold">€{plan.monthlyPrice}</span>
                      <span className="pb-1 text-sm text-slate-600">/ site / month</span>
                    </span>
                    <span className="mt-1 text-xs text-slate-500">
                      Ex VAT · Unlimited staff users
                    </span>

                    <ul className="mt-5 space-y-2 border-t border-slate-200 pt-4 text-sm text-slate-700">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex gap-2 leading-5">
                          <span aria-hidden="true" className="font-bold text-emerald-700">
                            +
                          </span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <span
                      className={`mt-5 block rounded-md px-3 py-2 text-center text-sm font-semibold ${
                        isSelected
                          ? 'bg-emerald-700 text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {isSelected ? 'Selected' : 'Select plan'}
                    </span>
                  </label>
                )
              })}
            </div>

            <details className="mt-4 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              <summary className="cursor-pointer font-semibold text-slate-900">
                Pricing details
              </summary>
              <div className="mt-3 grid gap-3 border-t border-slate-200 pt-3 md:grid-cols-3">
                {FLOWDISH_PLANS.map((plan) => (
                  <div key={plan.id}>
                    <div className="font-medium text-slate-900">{plan.name}</div>
                    <div className="mt-1 text-slate-600">
                      €{plan.annualPrice.toLocaleString('en-IE')} annually or €
                      {plan.monthlyPrice}/month. One-time setup €
                      {plan.setupPrice.toLocaleString('en-IE')}.
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500">
                <p className="font-medium text-slate-700">
                  For customers joining through the on-site consultancy programme, Flowdish
                  onboarding is incorporated into the wider consultancy engagement rather than
                  charged again as a separate setup fee.{' '}
                  <a
                    href="https://cocos.ie/"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Visit Coco&apos;s Culinary Group
                  </a>
                  .
                </p>
                <p>
                  Annual billing includes two months free. Enterprise includes 500 AI document
                  pages per site each month.
                </p>
                <p>
                  HACCP Core&apos;s €295 setup includes software and HACCP configuration, head-chef
                  onboarding, and one refrigeration probe installed and commissioned during
                  onboarding. Additional probes installed during the same visit are €69 each plus
                  €4 per month; monitoring for the first probe is included. A later installation
                  visit is €125 plus €69 per probe.
                </p>
                <p>
                  Kitchen Pro&apos;s €750 setup adds initial supplier, stock, recipe, costing and
                  planning configuration with team onboarding. Enterprise&apos;s €950 setup also
                  covers supplier and SKU matching, initial AI docket, price-list and POS import
                  testing, privacy workflow configuration and team training. Bespoke integrations
                  are quoted separately.
                </p>
                <p>All prices exclude VAT.</p>
              </div>
            </details>
          </fieldset>

          <section className="mx-auto mt-10 max-w-xl border-t border-slate-300 pt-8">
            <h2 className="text-center text-xl font-semibold text-slate-900">
              Create your owner account
            </h2>

            {error ? <CopyableError message={error} className="mt-5" /> : null}

            {message ? (
              <div className="sticky top-4 z-40 mt-5 whitespace-pre-wrap rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700 shadow-sm">
                {message}
              </div>
            ) : null}

            <div className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="signup-business-name"
                  className="mb-1 block text-sm font-medium text-slate-900"
                >
                  Business legal name
                </label>
                <input
                  id="signup-business-name"
                  value={businessLegalName}
                  onChange={(e) => setBusinessLegalName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  placeholder="Restaurant company or sole trader name"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="signup-email"
                  className="mb-1 block text-sm font-medium text-slate-900"
                >
                  Email
                </label>
                <input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  placeholder="chef@example.com"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="signup-password"
                  className="mb-1 block text-sm font-medium text-slate-900"
                >
                  Password
                </label>
                <input
                  id="signup-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  placeholder="Minimum 8 characters"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="signup-confirm-password"
                  className="mb-1 block text-sm font-medium text-slate-900"
                >
                  Confirm Password
                </label>
                <input
                  id="signup-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  placeholder="Repeat password"
                  required
                />
              </div>

              <TurnstileWidget
                onToken={setTurnstileToken}
                resetKey={turnstileResetKey}
              />

              <label className="flex items-start gap-3 rounded-md border bg-white p-3 text-sm leading-6 text-slate-700">
                <input
                  type="checkbox"
                  checked={legalAccepted}
                  onChange={(event) => setLegalAccepted(event.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 accent-emerald-700"
                  required
                />
                <span>
                  I confirm that I am authorised to act for the named business and agree to the{' '}
                  <Link href="/terms" target="_blank" className="font-medium underline">
                    Terms
                  </Link>{' '}
                  and{' '}
                  <Link href="/data-processing" target="_blank" className="font-medium underline">
                    Data Processing Agreement
                  </Link>
                  . I acknowledge the{' '}
                  <Link href="/privacy" target="_blank" className="font-medium underline">
                    Privacy Statement
                  </Link>
                  .
                </span>
              </label>

              {planUsesAi(selectedPlan) ? (
                <label className="flex items-start gap-3 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm leading-6 text-slate-700">
                  <input
                    type="checkbox"
                    checked={aiProcessingAccepted}
                    onChange={(event) => setAiProcessingAccepted(event.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-teal-700"
                    required
                  />
                  <span>
                    I understand that Enterprise AI features send selected or filtered document
                    content to OpenAI for processing, subject to human review before saving.{' '}
                    <Link
                      href="/ai-processing"
                      target="_blank"
                      className="font-medium underline"
                    >
                      AI processing details
                    </Link>
                  </span>
                </label>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-slate-900 px-4 py-3 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Creating account...' : 'Accept and create account'}
              </button>
            </div>

            <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm">
              <Link href="/login" className="font-medium text-slate-700 hover:text-slate-900">
                Already have an account?
              </Link>

              <Link href="/staff-login" className="font-medium text-slate-700 hover:text-slate-900">
                Staff PIN login
              </Link>
            </div>

            <div className="mt-3 text-center text-sm">
              <Link
                href="/privacy"
                className="font-medium text-slate-700 underline hover:text-slate-900"
              >
                Privacy statement
              </Link>
            </div>
          </section>
        </form>
      </div>
    </main>
  )
}
