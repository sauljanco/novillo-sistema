import { authorize, noAccess } from '../lib/serverAuth.js'

export async function POST(request: Request): Promise<Response> {
  const access = await authorize(request)
  if (!access || access.staff.role === 'cocina') return noAccess()
  let body: { order_id?: unknown; cash_session_id?: unknown; payment_method?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Datos inválidos' }, { status: 400 }) }
  const orderId = Number(body.order_id), sessionId = Number(body.cash_session_id)
  const method = String(body.payment_method)
  if (!Number.isSafeInteger(orderId) || orderId <= 0 || !Number.isSafeInteger(sessionId) || sessionId <= 0 || !['efectivo','qr'].includes(method)) {
    return Response.json({ error: 'Cobro inválido' }, { status: 400 })
  }
  try {
    const rows = await access.sql`SELECT public.pay_order(${orderId},${sessionId},${access.staff.user_id},${method}) AS id`
    const order = await access.sql`SELECT id,service_date,ticket_number,payment_method,paid_at,total_cents,status,created_at
      FROM public.orders WHERE id=${rows[0].id}`
    return Response.json({ order: order[0] }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'No se pudo cobrar. El pedido puede estar pagado o la caja cerrada.' }, { status: 409 })
  }
}
