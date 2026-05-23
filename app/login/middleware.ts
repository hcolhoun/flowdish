import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const publicRoutes = [
  '/login',
  '/signup',
  '/reset-password',
  '/staff-login',
]

function isPublicPath(path: string) {
  return (
    publicRoutes.some((route) => path === route || path.startsWith(`${route}/`)) ||
    path.startsWith('/_next') ||
    path.startsWith('/favicon') ||
    path.startsWith('/prawn.png') ||
    path.startsWith('/flowdish-banner-logo.png')
  )
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (key) => req.cookies.get(key)?.value,
        set: (key, value, options) => {
          res.cookies.set({ name: key, value, ...options })
        },
        remove: (key, options) => {
          res.cookies.set({ name: key, value: '', ...options })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = req.nextUrl.pathname

  if (isPublicPath(path)) {
    if (user && (path === '/login' || path === '/signup')) {
      return NextResponse.redirect(new URL('/', req.url))
    }

    return res
  }

  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}