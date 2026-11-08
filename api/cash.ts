import { authorize, noAccess } from '../lib/serverAuth.js'

export async function GET(request: Request): Promise<Response> {
  const access = await authorize(request)
  if (!access || access.staff.role === 'cocina') return noAccess()
  const sessions = await access.sql`
    SELECT s.id, s.opened_at, s.opening_cash_cents, s.opened_by,
      COALESCE(sum(o.total_cents) FILTER (WHERE o.payment_method = 'efectivo' AND o.status <> 'anulado'), 0)::integer AS cash_sales_cents,
      COALESCE(sum(o.total_cents) FILTER (WHERE o.payment_method = 'qr' AND o.status <> 'anulado'), 0)::integer AS qr_sales_cents
    FROM public.cash_sessions s LEFT JOIN public.orders o ON o.cash_session_id = s.id
    WHERE s.closed_at IS NULL
    GROUP BY s.id ORDER BY s.id DESC LIMIT 1`
  return Response.json({ session: sessions[0] ?? null }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request): Promise<Response> {
  const access = await authorize(request)
  if (!access || access.staff.role === 'cocina') return noAccess()
  let body: { opening_cash_cents?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Datos inválidos' }, { status: 400 }) }
  if (!Number.isSafeInteger(body.opening_cash_cents) || Number(body.opening_cash_cents) < 0 || Number(body.opening_cash_cents) > 100000000) {
    return Response.json({ error: 'Fondo inicial inválido' }, { status: 400 })
  }
  try {
    const rows = await access.sql`INSERT INTO public.cash_sessions (opened_by, opening_cash_cents)
      VALUES (${access.staff.user_id}, ${Number(body.opening_cash_cents)}) RETURNING id, opened_at, opening_cash_cents`
    return Response.json({ session: rows[0] }, { status: 201 })
  } catch {
    return Response.json({ error: 'Ya existe una caja abierta o no se pudo abrir' }, { status: 409 })
  }
}
