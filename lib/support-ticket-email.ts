import { systemOwnerEmails } from '@/lib/system-owner'

type SupportTicketEmailOptions = {
  ticket: {
    id: string
    subject: string
    category: string
    priority: string
    message: string
    errorText: string | null
    pageUrl: string | null
    createdByEmail: string | null
  }
  restaurantName: string
}

export function supportTicketEmailConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY &&
      (process.env.SUPPORT_TICKET_FROM_EMAIL || process.env.SUPPLIER_CREDIT_FROM_EMAIL) &&
      systemOwnerEmails().length > 0
  )
}

export async function sendSupportTicketAlert({
  ticket,
  restaurantName,
}: SupportTicketEmailOptions) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.SUPPORT_TICKET_FROM_EMAIL || process.env.SUPPLIER_CREDIT_FROM_EMAIL
  const to = systemOwnerEmails()

  if (!apiKey || !from || to.length === 0) {
    throw new Error('SUPPORT_TICKET_EMAIL_NOT_CONFIGURED')
  }

  const subject = `[Flowdish Support] ${ticket.priority}: ${ticket.subject}`
  const text = [
    'A new Flowdish support ticket was submitted.',
    '',
    `Restaurant: ${restaurantName}`,
    `From: ${ticket.createdByEmail || 'Unknown'}`,
    `Category: ${ticket.category}`,
    `Priority: ${ticket.priority}`,
    `Ticket ID: ${ticket.id}`,
    ticket.pageUrl ? `Page: ${ticket.pageUrl}` : null,
    '',
    'Message:',
    ticket.message,
    ticket.errorText ? '' : null,
    ticket.errorText ? 'Error text/code:' : null,
    ticket.errorText,
  ]
    .filter((line) => line !== null)
    .join('\n')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `support-ticket-${ticket.id}`,
    },
    body: JSON.stringify({
      from,
      to,
      ...(ticket.createdByEmail ? { reply_to: ticket.createdByEmail } : {}),
      subject,
      text,
      tags: [
        { name: 'feature', value: 'support_ticket' },
        { name: 'ticket_id', value: ticket.id },
      ],
    }),
  })

  const responseText = await res.text()

  if (!res.ok) {
    throw new Error(responseText.slice(0, 1000) || 'SUPPORT_TICKET_EMAIL_FAILED')
  }

  return { responseText }
}
