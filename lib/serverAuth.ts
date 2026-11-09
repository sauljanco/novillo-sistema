import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { createRemoteJWKSet, jwtVerify } from 'jose'

export type Role = 'superadministrador' | 'administrador' | 'caja' | 'cocina'
export type Staff = { user_id: string; display_name: string; role: Role }

const authUrl = process.env.NEON_AUTH_BASE_URL
const jwksUrl = authUrl ? `${authUrl}/.well-known/jwks.json` : ''
const jwks = jwksUrl ? createRemoteJWKSet(new URL(jwksUrl)) : null

export async function authorize(request: Request): Promise<{ staff: Staff; sql: NeonQueryFunction<false, false> } | null> {
  if (!jwks || !authUrl || !process.env.DATABASE_URL) return null
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  try {
    const { payload } = await jwtVerify(header.slice(7), jwks, { issuer: new URL(authUrl).origin })
    if (!payload.sub) return null
    const sql = neon(process.env.DATABASE_URL)
    let rows = await sql`SELECT s.user_id, s.display_name, s.role
      FROM public.staff_access s JOIN neon_auth."user" u ON u.id::text = s.user_id
      WHERE s.user_id = ${payload.sub} AND s.active = true AND u."emailVerified" = true`
    if (rows.length === 0) {
      const claim = await sql`SELECT public.claim_staff_invite(${payload.sub}) AS accepted`
      if (claim[0]?.accepted) {
        rows = await sql`SELECT s.user_id, s.display_name, s.role
          FROM public.staff_access s JOIN neon_auth."user" u ON u.id::text = s.user_id
          WHERE s.user_id = ${payload.sub} AND s.active = true AND u."emailVerified" = true`
      }
    }
    if (rows.length !== 1) return null
    return { staff: rows[0] as Staff, sql }
  } catch {
    return null
  }
}

export function noAccess(): Response {
  return Response.json({ error: 'Acceso no autorizado' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
}
