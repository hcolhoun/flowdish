type TurnstileResponse = {
  success: boolean
  'error-codes'?: string[]
}

export async function verifyTurnstileToken(token: unknown, remoteIp?: string | null) {
  const secret = process.env.TURNSTILE_SECRET_KEY

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('TURNSTILE_NOT_CONFIGURED')
    }

    return
  }

  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('TURNSTILE_REQUIRED')
  }

  const formData = new FormData()
  formData.append('secret', secret)
  formData.append('response', token)

  if (remoteIp) {
    formData.append('remoteip', remoteIp)
  }

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData,
  })

  const data = (await res.json()) as TurnstileResponse

  if (!res.ok || !data.success) {
    throw new Error('TURNSTILE_FAILED')
  }
}

export function turnstileErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'Security check failed. Try again.'

  if (error.message === 'TURNSTILE_NOT_CONFIGURED') {
    return 'Security check is not configured yet.'
  }

  if (error.message === 'TURNSTILE_REQUIRED') {
    return 'Complete the security check before continuing.'
  }

  return 'Security check failed. Try again.'
}
