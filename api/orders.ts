import { authorize, noAccess } from '../lib/serverAuth.js'

export async function GET(request: Request): Promise<Response> {
  const access = await authorize(request)
  if (!access) return noAccess()
  const orders = await access.sql`
    SELECT o.id, o.service_date, o.ticket_number, o.payment_method, o.total_cents, o.status, o.created_at,
      COALESCE(json_agg(json_build_object('name', i.product_name, 'presentation', i.presentation, 'quantity', i.quantity, 'line_total_cents', i.line_total_cents))
        FILTER (WHERE i.id IS NOT NULL), '[]') AS items
    FROM public.orders o LEFT JOIN public.order_items i ON i.order_id = o.id
    WHERE o.service_date = (now() AT TIME ZONE 'America/La_Paz')::date
    GROUP BY o.id ORDER BY o.id DESC LIMIT 50`
  return Response.json({ orders }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request): Promise<Response> {
  const access = await authorize(request)
  if (!access || access.staff.role === 'cocina') return noAccess()
  let body: { cash_session_id?: unknown; payment_method?: unknown; items?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Datos inválidos' }, { status: 400 }) }
  if (!Number.isSafeInteger(body.cash_session_id) || !['efectivo', 'qr'].includes(String(body.payment_method)) ||
      !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50 ||
      !body.items.every((item: unknown) => item !== null && typeof item === 'object' &&
        Number.isSafeInteger((item as { product_id?: unknown }).product_id) &&
        Number.isSafeInteger((item as { quantity?: unknown }).quantity) &&
        Number((item as { quantity?: unknown }).quantity) >= 1 && Number((item as { quantity?: unknown }).quantity) <= 99)) {
    return Response.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  try {
    const rows = await access.sql`SELECT public.create_paid_order(
      ${Number(body.cash_session_id)}, ${access.staff.user_id}, ${String(body.payment_method)}, ${JSON.stringify(body.items)}::jsonb
    ) AS id`
    const order = await access.sql`SELECT id, service_date, ticket_number, payment_method, total_cents, status
      FROM public.orders WHERE id = ${rows[0].id}`
    return Response.json({ order: order[0] }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'No se pudo registrar el pedido. Revisa caja y productos.' }, { status: 409 })
  }
}
