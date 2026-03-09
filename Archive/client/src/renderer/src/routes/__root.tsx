import { createRootRoute, Outlet, useLocation } from '@tanstack/react-router'
import Layout from '@/components/layout/Layout'
import { AuthProvider } from '@/lib/auth-context'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <AuthProvider>
      <RootLayout />
    </AuthProvider>
  )
}

function RootLayout() {
  const location = useLocation()
  const isAuthPage =
    location.pathname.startsWith('/login') || location.pathname.startsWith('/signup')

  return <>{isAuthPage ? <Outlet /> : <Layout />}</>
}
