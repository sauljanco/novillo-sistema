import { createAuthClient } from '@neondatabase/auth'
import { BetterAuthReactAdapter } from '@neondatabase/auth/react/adapters'

export const neonAuth = import.meta.env.VITE_NEON_AUTH_URL
  ? createAuthClient(import.meta.env.VITE_NEON_AUTH_URL, { adapter: BetterAuthReactAdapter() })
  : null

export async function authorizedFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!neonAuth) throw new Error('Autenticación sin configurar')
  const session = await neonAuth.getSession()
  const sessionToken = session.data?.session?.token
  const result = await neonAuth.token()
  const token: string | null = result.data?.token ?? (sessionToken?.split('.').length === 3 ? sessionToken : null)
  if (!token) throw new Error(`Neon Auth no entregó JWT (sesión: ${sessionToken ? 'activa' : 'ausente'}; token: ${result.error?.code ?? result.error?.message ?? 'vacío'}).`)
  return fetch(path, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
  })
}
