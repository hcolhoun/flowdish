import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
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

  // Allow login page and static files
  if (
    path.startsWith('/login') ||
    path.startsWith('/_next') ||
    path.startsWith('/favicon')
  ) {
    return res
  }

  // Not logged in → force login
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Logged in → prevent going back to login
  if (user && path === '/login') {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return res
}