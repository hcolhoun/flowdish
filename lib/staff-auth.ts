import crypto from 'crypto'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

export const STAFF_SESSION_COOKIE = 'flowdish_staff_session'
export const STAFF_SESSION_SECONDS = 2 * 60 * 60

type StaffSessionPayload = {
  type: 'staff'
  staffUserId: string
  restaurantId: string
  username: string
  displayName: string
  isAccountPin?: boolean
  accountAuthUserId?: string | null
  accountEmail?: string | null
  exp: number
}

function staffSecret() {
  const secret = process.env.STAFF_SESSION_SECRET

  if (!secret) {
    throw new Error('Missing environment variable: STAFF_SESSION_SECRET')
  }

  return secret
}

function base64url(value: Buffer | string) {
  return Buffer.from(value).toString('base64url')
}

function signValue(value: string) {
  return crypto.createHmac('sha256', staffSecret()).update(value).digest('base64url')
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)

  if (aBuffer.length !== bBuffer.length) return false

  return crypto.timingSafeEqual(aBuffer, bBuffer)
}

export function hashPin(pin: string) {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('PIN must be exactly 4 digits')
  }

  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(pin, salt, 32).toString('hex')

  return `scrypt:${salt}:${hash}`
}

export function verifyPin(pin: string, storedHash: string) {
  if (!/^\d{4}$/.test(pin)) return false

  const [method, salt, hash] = storedHash.split(':')

  if (method !== 'scrypt' || !salt || !hash) return false

  const testHash = crypto.scryptSync(pin, salt, 32).toString('hex')

  return safeEqual(testHash, hash)
}

export function createStaffSessionToken(payload: Omit<StaffSessionPayload, 'exp'>) {
  const exp = Math.floor(Date.now() / 1000) + STAFF_SESSION_SECONDS

  const fullPayload: StaffSessionPayload = {
    ...payload,
    exp,
  }

  const encodedPayload = base64url(JSON.stringify(fullPayload))
  const signature = signValue(encodedPayload)

  return `${encodedPayload}.${signature}`
}

export function verifyStaffSessionToken(token: string): StaffSessionPayload | null {
  const [encodedPayload, signature] = token.split('.')

  if (!encodedPayload || !signature) return null

  const expectedSignature = signValue(encodedPayload)

  if (!safeEqual(signature, expectedSignature)) return null

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as StaffSessionPayload

    if (payload.type !== 'staff') return null

    const now = Math.floor(Date.now() / 1000)

    if (!payload.exp || payload.exp <= now) return null

    return payload
  } catch {
    return null
  }
}

export async function getStaffSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(STAFF_SESSION_COOKIE)?.value

  if (!token) return null

  const payload = verifyStaffSessionToken(token)

  if (!payload) return null

  const staffUser = await prisma.staffUser.findFirst({
    where: {
      id: payload.staffUserId,
      restaurantId: payload.restaurantId,
      active: true,
    },
    include: {
      restaurant: true,
    },
  })

  if (!staffUser) return null

  const accountMembership =
    staffUser.isAccountPin && staffUser.accountAuthUserId
      ? await prisma.userMembership.findFirst({
          where: {
            authUserId: staffUser.accountAuthUserId,
            restaurantId: staffUser.restaurantId,
          },
        })
      : null

  return {
    staffUserId: staffUser.id,
    restaurantId: staffUser.restaurantId,
    restaurantName: staffUser.restaurant.name,
    username: staffUser.username,
    displayName: staffUser.displayName,
    role: 'STAFF' as const,
    isAccountPin: staffUser.isAccountPin,
    accountAuthUserId: staffUser.accountAuthUserId,
    accountEmail: staffUser.accountEmail,
    accountRole: accountMembership?.role ?? null,
  }
}
