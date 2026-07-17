import { NextRequest, NextResponse } from 'next/server'
import { validateVAToken, VA_TOKEN_COOKIE } from '@/lib/va-auth'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function setTokenCookie(response: NextResponse, token: string) {
  response.cookies.set(VA_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
  return response
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const member = await validateVAToken(token)

  if (!member) {
    return NextResponse.redirect(new URL('/va?error=invalid', request.url))
  }

  return setTokenCookie(NextResponse.redirect(new URL('/va/dashboard', request.url)), token!)
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const token = typeof body.token === 'string' ? body.token : null
  const member = await validateVAToken(token)

  if (!member) {
    return NextResponse.json({ error: 'Invalid or expired access token' }, { status: 401 })
  }

  return setTokenCookie(NextResponse.json({ member }), token!)
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.delete(VA_TOKEN_COOKIE)
  return response
}
