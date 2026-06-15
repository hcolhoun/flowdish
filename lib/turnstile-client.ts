export async function verifyTurnstileBeforeSubmit(turnstileToken: string) {
  if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.NODE_ENV !== 'production') {
    return
  }

  const res = await fetch('/api/turnstile/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ turnstileToken }),
  })

  const text = await res.text()
  const data = text ? JSON.parse(text) : null

  if (!res.ok) {
    throw new Error(data?.error || 'Security check failed. Try again.')
  }
}
