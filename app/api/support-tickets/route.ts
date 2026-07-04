import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenant, tenantErrorResponse } from '@/lib/tenant'
import { isSystemOwnerEmail } from '@/lib/system-owner'
import {
  sendSupportTicketAlert,
  supportTicketEmailConfigured,
} from '@/lib/support-ticket-email'

const CATEGORIES = ['General', 'Bug/Error', 'Data issue', 'AI import', 'Login/access', 'Billing']
const PRIORITIES = ['Normal', 'Urgent']

function cleanText(value: unknown, maxLength: number) {
  return String(value || '').trim().slice(0, maxLength)
}

export async function GET() {
  try {
    const tenant = await requireTenant()
    const isSystemOwner = isSystemOwnerEmail(tenant.email)

    const tickets = await prisma.supportTicket.findMany({
      where: isSystemOwner ? undefined : { restaurantId: tenant.restaurantId },
      orderBy: [
        { status: 'asc' },
        { createdAt: 'desc' },
      ],
      include: {
        restaurant: {
          select: {
            name: true,
            plan: true,
          },
        },
      },
    })

    return NextResponse.json({
      tickets,
      emailServiceConfigured: supportTicketEmailConfigured(),
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('GET /api/support-tickets failed:', error)
    return NextResponse.json({ error: 'Failed to load support tickets.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant()
    const body = await req.json()

    const subject = cleanText(body.subject, 140)
    const message = cleanText(body.message, 5000)
    const errorText = cleanText(body.errorText, 5000) || null
    const pageUrl = cleanText(body.pageUrl, 1000) || null
    const category = CATEGORIES.includes(body.category) ? body.category : 'General'
    const priority = PRIORITIES.includes(body.priority) ? body.priority : 'Normal'

    if (!subject) {
      return NextResponse.json({ error: 'Subject is required.' }, { status: 400 })
    }

    if (!message) {
      return NextResponse.json({ error: 'Tell us what happened.' }, { status: 400 })
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        restaurantId: tenant.restaurantId,
        subject,
        category,
        priority,
        message,
        errorText,
        pageUrl,
        createdByName: tenant.email || 'Chef',
        createdByEmail: tenant.email,
        createdByAuthUserId: tenant.authUserId,
      },
      include: {
        restaurant: {
          select: {
            name: true,
          },
        },
      },
    })

    let emailAlertSent = false
    let emailAlertError: string | null = null

    try {
      await sendSupportTicketAlert({
        ticket,
        restaurantName: ticket.restaurant.name,
      })
      emailAlertSent = true
    } catch (emailError) {
      emailAlertError =
        emailError instanceof Error ? emailError.message : 'Failed to send support ticket alert'
      console.error('Support ticket alert email failed:', emailAlertError)
    }

    return NextResponse.json({
      ticket,
      emailAlertSent,
      emailServiceConfigured: supportTicketEmailConfigured(),
    })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('POST /api/support-tickets failed:', error)
    return NextResponse.json({ error: 'Failed to save support ticket.' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const tenant = await requireTenant()
    const isSystemOwner = isSystemOwnerEmail(tenant.email)

    if (!isSystemOwner) {
      return NextResponse.json({ error: 'System owner access required.' }, { status: 403 })
    }

    const body = await req.json()
    const id = cleanText(body.id, 100)
    const status = body.status

    if (!id) {
      return NextResponse.json({ error: 'Ticket id is required.' }, { status: 400 })
    }

    if (!['OPEN', 'CLOSED'].includes(status)) {
      return NextResponse.json({ error: 'Valid ticket status is required.' }, { status: 400 })
    }

    const ticket = await prisma.supportTicket.update({
      where: { id },
      data: { status },
    })

    return NextResponse.json({ ticket })
  } catch (error) {
    const tenantError = tenantErrorResponse(error)
    if (tenantError) return tenantError

    console.error('PATCH /api/support-tickets failed:', error)
    return NextResponse.json({ error: 'Failed to update support ticket.' }, { status: 500 })
  }
}
