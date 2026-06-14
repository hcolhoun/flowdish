import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseEmailList, sendEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function cleanText(value: unknown) {
  return String(value ?? '').trim()
}

function parseTriggeredAt(value: unknown) {
  const text = cleanText(value)
  if (!text) return new Date()

  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const deviceKey = cleanText(body.deviceKey || body.key || body.monitorKey)
    const deviceName = cleanText(body.deviceName || body.device || body['Device Name']) || null
    const target = cleanText(body.target || body.Target) || null
    const message = cleanText(body.message || body.event || body.Event) || null
    const triggeredAt = parseTriggeredAt(body.createdAt || body.CreatedAt)

    if (!deviceKey) {
      return NextResponse.json({ error: 'Device key is required.' }, { status: 400 })
    }

    const monitor = await prisma.coldStorageMonitor.findUnique({
      where: {
        deviceKey,
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            coldStorageAlertsEnabled: true,
            coldStorageAlertEmails: true,
          },
        },
      },
    })

    if (!monitor || !monitor.active) {
      return NextResponse.json({ error: 'Cold storage monitor not found.' }, { status: 404 })
    }

    const recipients = parseEmailList(monitor.restaurant.coldStorageAlertEmails)
    const shouldEmail = monitor.restaurant.coldStorageAlertsEnabled && recipients.length > 0
    const subject = `Flowdish temperature alert: ${monitor.name}`
    const text = [
      `Temperature alert for ${monitor.name}.`,
      monitor.location ? `Location: ${monitor.location}` : null,
      `Restaurant: ${monitor.restaurant.name}`,
      deviceName ? `eWeLink device: ${deviceName}` : null,
      target ? `eWeLink target: ${target}` : null,
      message ? `Message: ${message}` : null,
      `Triggered: ${triggeredAt.toLocaleString('en-IE')}`,
      '',
      'Open Flowdish Cold Storage to review the temperature records.',
    ]
      .filter(Boolean)
      .join('\n')

    const emailResult = shouldEmail
      ? await sendEmail({
          to: recipients,
          subject,
          text,
        })
      : {
          sent: false,
          error: monitor.restaurant.coldStorageAlertsEnabled
            ? 'No alert email recipients configured.'
            : 'Cold storage alerts are disabled.',
        }

    const alert = await prisma.coldStorageAlertEvent.create({
      data: {
        restaurantId: monitor.restaurantId,
        monitorId: monitor.id,
        deviceName,
        target,
        message,
        source: 'ifttt-ewelink',
        triggeredAt,
        emailSent: emailResult.sent,
        emailError: emailResult.error,
      },
    })

    return NextResponse.json({
      success: true,
      alertId: alert.id,
      emailSent: emailResult.sent,
      emailError: emailResult.error || null,
    })
  } catch (error) {
    console.error('POST /api/cold-storage/alerts/ifttt failed:', error)
    return NextResponse.json({ error: 'Failed to process cold storage alert.' }, { status: 500 })
  }
}
