import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname

  if (
    path.startsWith('/login') ||
    path.startsWith('/_next') ||
    path.startsWith('/favicon') ||
    path.startsWith('/api')
  ) {
    return NextResponse.next()
  }

  const hasSupabaseCookie = req.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith('sb-'))

  if (!hasSupabaseCookie) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}