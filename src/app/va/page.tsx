import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { validateVAToken, VA_TOKEN_COOKIE } from '@/lib/va-auth'
import { VALoginForm } from '@/components/va/VALoginForm'

export const dynamic = 'force-dynamic'

export default async function VAEntryPage({
  searchParams,
}: {
  searchParams: { token?: string; error?: string }
}) {
  if (searchParams.token) {
    redirect(`/api/va/auth?token=${encodeURIComponent(searchParams.token)}`)
  }

  const cookieToken = cookies().get(VA_TOKEN_COOKIE)?.value
  const member = await validateVAToken(cookieToken)
  if (member) {
    redirect('/va/dashboard')
  }

  return <VALoginForm invalid={searchParams.error === 'invalid'} />
}
