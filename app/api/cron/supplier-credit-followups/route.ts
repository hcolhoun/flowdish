import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendSupplierCreditFollowUp } from '@/lib/supplier-credit-email'

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authorization = req.headers.get('authorization')

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const dueClaims = await prisma.supplierCreditClaim.findMany({
    where: {
      status: 'OPEN',
      nextFollowUpAt: {
        lte: new Date(),
      },
    },
    orderBy: { nextFollowUpAt: 'asc' },
    take: 25,
  })

  let sent = 0
  const failed: Array<{ claimId: string; error: string }> = []

  for (const claim of dueClaims) {
    try {
      await sendSupplierCreditFollowUp({ claimId: claim.id })
      sent++
    } catch (error) {
      failed.push({
        claimId: claim.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return NextResponse.json({
    attempted: dueClaims.length,
    sent,
    failed,
  })
}
