import { authorize, noAccess } from '../lib/serverAuth.js'

export async function POST(request: Request): Promise<Response> {
  const access = await authorize(request)
  if (!access || access.staff.role === 'cocina') return noAccess()
  let body: { session_id?: unknown; counted_cash_cents?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Datos inválidos' }, { status: 400 }) }
  if (!Number.isSafeInteger(body.session_id) || !Number.isSafeInteger(body.counted_cash_cents) ||
      Number(body.counted_cash_cents) < 0 || Number(body.counted_cash_cents) > 100000000) {
    return Response.json({ error: 'Conteo inválido' }, { status: 400 })
  }
  try {
    const rows = await access.sql`SELECT * FROM public.close_cash_session(
      ${Number(body.session_id)}, ${access.staff.user_id}, ${Number(body.counted_cash_cents)})`
    return Response.json({ closing: rows[0] }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'No se pudo cerrar la caja' }, { status: 409 })
  }
}
