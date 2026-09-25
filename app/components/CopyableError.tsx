'use client'

import { useEffect, useState } from 'react'

export const LAST_FLOWDISH_ERROR_KEY = 'flowdish:last-visible-error'

type CopyableErrorProps = {
  message: string
  className?: string
}

export default function CopyableError({ message, className = '' }: CopyableErrorProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        LAST_FLOWDISH_ERROR_KEY,
        JSON.stringify({
          message,
          pageUrl: window.location.href,
          capturedAt: new Date().toISOString(),
        })
      )
    } catch {
      // Support diagnostics are optional when browser storage is unavailable.
    }
  }, [message])

  async function copyError() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      className={`sticky top-4 z-40 flex flex-col gap-3 whitespace-pre-wrap rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm sm:flex-row sm:items-start sm:justify-between ${className}`}
    >
      <div className="min-w-0 flex-1">{message}</div>
      <button
        type="button"
        onClick={copyError}
        className="self-start rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
