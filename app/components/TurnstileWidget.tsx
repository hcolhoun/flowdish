'use client'

import { useEffect, useRef, useState } from 'react'
import CopyableError from '@/app/components/CopyableError'

type TurnstileWidgetProps = {
  onToken: (token: string) => void
  resetKey: number
}

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    }
  ) => string
  reset: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let turnstileScriptPromise: Promise<void> | null = null

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve()

  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]'
      )

      if (existingScript) {
        existingScript.addEventListener('load', () => resolve())
        existingScript.addEventListener('error', () => reject(new Error('Turnstile failed to load')))
        return
      }

      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Turnstile failed to load'))
      document.head.appendChild(script)
    })
  }

  return turnstileScriptPromise
}

export function TurnstileWidget({ onToken, resetKey }: TurnstileWidgetProps) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!siteKey || !containerRef.current || widgetIdRef.current) return

    let cancelled = false

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile || !containerRef.current) return

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: onToken,
          'expired-callback': () => onToken(''),
          'error-callback': () => onToken(''),
        })
      })
      .catch(() => {
        if (!cancelled) setLoadError('Security check could not load. Refresh and try again.')
      })

    return () => {
      cancelled = true
    }
  }, [onToken, siteKey])

  useEffect(() => {
    onToken('')

    if (window.turnstile && widgetIdRef.current) {
      window.turnstile.reset(widgetIdRef.current)
    }
  }, [onToken, resetKey])

  if (!siteKey) return null

  return (
    <div>
      <div ref={containerRef} className="min-h-[65px]" />
      {loadError ? (
        <CopyableError message={loadError} className="mt-1" />
      ) : null}
    </div>
  )
}
