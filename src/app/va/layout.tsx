import { cookies } from 'next/headers'
import { validateVAToken, VA_TOKEN_COOKIE } from '@/lib/va-auth'
import { VASidebar } from '@/components/VASidebar'

export default async function VALayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const token = cookies().get(VA_TOKEN_COOKIE)?.value
  const member = await validateVAToken(token)

  if (!member) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-4 text-foreground">
        {children}
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <VASidebar member={member} />
      <main className="flex-1 overflow-y-auto scrollbar-thin">{children}</main>
    </div>
  )
}
