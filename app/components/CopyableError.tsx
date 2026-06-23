'use client'

import { useState } from 'react'

type CopyableErrorProps = {
  message: string
  className?: string
}

export default function CopyableError({ message, className = '' }: CopyableErrorProps) {
  const [copied, setCopied] = useState(false)

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
      className={`flex flex-col gap-3 whitespace-pre-wrap rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-start sm:justify-between ${className}`}
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
