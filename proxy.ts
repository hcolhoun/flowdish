import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname

  const isLogin = path.startsWith('/login')
  const isStatic =
    path.startsWith('/_next') ||
    path.startsWith('/favicon') ||
    path.includes('.')

  if (isLogin || isStatic) {
    return NextResponse.next()
  }

  const hasSupabaseCookie = req.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith('sb-'))

  if (!hasSupabaseCookie) {
    if (path.startsWith('/api')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}