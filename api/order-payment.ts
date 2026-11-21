import { authorize, noAccess } from '../lib/serverAuth.js'

export async function POST(request: Request): Promise<Response> {
  const access = await authorize(request)
  if (!access || access.staff.role === 'cocina') return noAccess()
  let body: { order_id?: unknown; cash_session_id?: unknown; payment_method?: unknown; expected_total_cents?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Datos inválidos' }, { status: 400 }) }
  const orderId = Number(body.order_id), sessionId = Number(body.cash_session_id)
  const method = String(body.payment_method)
  if (!Number.isSafeInteger(orderId) || orderId <= 0 || !Number.isSafeInteger(sessionId) || sessionId <= 0 ||
      !Number.isSafeInteger(body.expected_total_cents) || Number(body.expected_total_cents) <= 0 || !['efectivo','qr'].includes(method)) {
    return Response.json({ error: 'Cobro inválido' }, { status: 400 })
  }
  try {
    const rows = await access.sql`SELECT public.pay_order(${orderId},${sessionId},${access.staff.user_id},${method},${Number(body.expected_total_cents)}) AS id`
    const order = await access.sql`SELECT id,service_date,ticket_number,table_number,payment_method,paid_at,total_cents,status,created_at
      FROM public.orders WHERE id=${rows[0].id}`
    const items = await access.sql`SELECT product_name AS name,presentation,quantity,unit_price_cents,line_total_cents
      FROM public.order_items WHERE order_id=${rows[0].id} ORDER BY id`
    return Response.json({ order: { ...order[0], items } }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'No se pudo cobrar. El total pudo cambiar; revisa la cuenta, el pedido y la caja.' }, { status: 409 })
  }
}
