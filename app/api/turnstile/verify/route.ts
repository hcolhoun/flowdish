import { NextResponse } from 'next/server'
import { turnstileErrorMessage, verifyTurnstileToken } from '@/lib/turnstile'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const remoteIp = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')

    await verifyTurnstileToken(body.turnstileToken, remoteIp)

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: turnstileErrorMessage(error) }, { status: 400 })
  }
}
