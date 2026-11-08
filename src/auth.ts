import { createAuthClient } from '@neondatabase/auth'
import { BetterAuthReactAdapter } from '@neondatabase/auth/react/adapters'

export const neonAuth = import.meta.env.VITE_NEON_AUTH_URL
  ? createAuthClient(import.meta.env.VITE_NEON_AUTH_URL, { adapter: BetterAuthReactAdapter() })
  : null

export async function authorizedFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!neonAuth) throw new Error('Autenticación sin configurar')
  const result = await neonAuth.getSession()
  const token: string | null = result.data?.session?.token ?? null
  if (!token) throw new Error('La sesión venció. Vuelve a ingresar.')
  return fetch(path, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
  })
}
