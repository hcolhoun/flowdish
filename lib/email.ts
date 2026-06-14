type EmailResult = {
  sent: boolean
  error?: string
}

export function parseEmailList(value: string | null | undefined) {
  return String(value || '')
    .split(/[,\n;]/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
    .filter((email, index, emails) => emails.indexOf(email) === index)
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export async function sendEmail(params: {
  to: string[]
  subject: string
  text: string
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.ALERT_FROM_EMAIL || process.env.RESEND_FROM_EMAIL

  if (!apiKey || !from) {
    return { sent: false, error: 'Email provider is not configured.' }
  }

  if (params.to.length === 0) {
    return { sent: false, error: 'No alert email recipients configured.' }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: params.subject,
      text: params.text,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    return { sent: false, error: text.slice(0, 500) || 'Email send failed.' }
  }

  return { sent: true }
}
