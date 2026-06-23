import { prisma } from '@/lib/prisma'

type SendSupplierCreditFollowUpOptions = {
  claimId: string
}

function quantityLabel(qty: number | null, unitType: string | null) {
  if (qty === null) return 'Not recorded'
  return `${qty}${unitType ? ` ${unitType}` : ''}`
}

function moneyLabel(value: number | null) {
  if (value === null) return 'Not recorded'
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

function dateLabel(value: Date) {
  return value.toLocaleDateString('en-IE', {
    timeZone: 'Europe/Dublin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function validEmail(value: string | null | undefined) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
}

function replyToEmail(
  memberships: Array<{ email: string | null; role: string }>,
  fallbackEmail: string | null
) {
  const preferredRoles = ['OWNER', 'ADMIN']

  for (const role of preferredRoles) {
    const membership = memberships.find(
      (member) => member.role === role && validEmail(member.email)
    )

    if (membership?.email) return membership.email
  }

  return validEmail(fallbackEmail) ? fallbackEmail : null
}

export async function sendSupplierCreditFollowUp({
  claimId,
}: SendSupplierCreditFollowUpOptions) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.SUPPLIER_CREDIT_FROM_EMAIL

  if (!apiKey || !from) {
    throw new Error('SUPPLIER_CREDIT_EMAIL_NOT_CONFIGURED')
  }

  const claim = await prisma.supplierCreditClaim.findUnique({
    where: { id: claimId },
    include: {
      restaurant: {
        select: {
          name: true,
          memberships: {
            select: {
              email: true,
              role: true,
            },
          },
        },
      },
    },
  })

  if (!claim || claim.status !== 'OPEN') {
    throw new Error('SUPPLIER_CREDIT_CLAIM_NOT_OPEN')
  }

  const config = await prisma.supplierCreditConfig.findFirst({
    where: {
      restaurantId: claim.restaurantId,
      supplier: {
        equals: claim.supplier,
        mode: 'insensitive',
      },
      enabled: true,
    },
  })

  if (!config) {
    throw new Error('SUPPLIER_CREDIT_CONFIG_NOT_FOUND')
  }

  if (claim.followUpCount >= config.maxFollowUps) {
    await prisma.supplierCreditClaim.update({
      where: { id: claim.id },
      data: { nextFollowUpAt: null },
    })
    throw new Error('SUPPLIER_CREDIT_MAX_FOLLOWUPS_REACHED')
  }

  const followUpNumber = claim.followUpCount + 1
  const supplierReplyTo = replyToEmail(
    claim.restaurant.memberships,
    claim.createdByEmail
  )
  const subject = `Credit follow-up: ${claim.productName}${
    claim.docketNumber ? ` - docket ${claim.docketNumber}` : ''
  }`
  const text = [
    `Hello ${claim.supplier},`,
    '',
    `This is follow-up ${followUpNumber} regarding an item charged to ${claim.restaurant.name} but not received.`,
    '',
    `Product: ${claim.productName}`,
    `Supplier SKU: ${claim.supplierSku || 'Not recorded'}`,
    `Quantity: ${quantityLabel(claim.qty, claim.unitType)}`,
    `Amount charged: ${moneyLabel(claim.chargedAmount)}`,
    `Docket number: ${claim.docketNumber || 'Not recorded'}`,
    `Docket date: ${dateLabel(claim.chargedAt)}`,
    claim.notes ? `Notes: ${claim.notes}` : null,
    '',
    'Please confirm that the appropriate credit note has been issued.',
    '',
    `Regards,`,
    claim.restaurant.name,
  ]
    .filter((line) => line !== null)
    .join('\n')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `supplier-credit-${claim.id}-${followUpNumber}`,
    },
    body: JSON.stringify({
      from,
      to: [config.supplierEmail],
      ...(config.ccEmail ? { cc: [config.ccEmail] } : {}),
      ...(supplierReplyTo ? { reply_to: supplierReplyTo } : {}),
      subject,
      text,
      tags: [
        { name: 'feature', value: 'supplier_credit' },
        { name: 'claim_id', value: claim.id },
      ],
    }),
  })

  const responseText = await res.text()

  if (!res.ok) {
    await prisma.supplierCreditClaim.update({
      where: { id: claim.id },
      data: {
        lastEmailError: responseText.slice(0, 1000),
      },
    })
    throw new Error('SUPPLIER_CREDIT_EMAIL_FAILED')
  }

  const now = new Date()
  const nextCount = claim.followUpCount + 1

  await prisma.supplierCreditClaim.update({
    where: { id: claim.id },
    data: {
      followUpCount: nextCount,
      lastFollowUpAt: now,
      nextFollowUpAt:
        nextCount >= config.maxFollowUps
          ? null
          : addDays(now, config.repeatEveryDays),
      lastEmailError: null,
    },
  })

  return { followUpNumber, responseText }
}
