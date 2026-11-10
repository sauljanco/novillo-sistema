import { authorize, noAccess } from '../lib/serverAuth.js'

export async function GET(request: Request): Promise<Response> {
  const access = await authorize(request)
  if (!access) return noAccess()
  const orders = await access.sql`
    SELECT o.id, o.service_date, o.ticket_number, o.payment_method, o.paid_at, o.total_cents, o.status, o.created_at,
      COALESCE(json_agg(json_build_object('name', i.product_name, 'presentation', i.presentation, 'quantity', i.quantity, 'unit_price_cents', i.unit_price_cents, 'line_total_cents', i.line_total_cents))
        FILTER (WHERE i.id IS NOT NULL), '[]') AS items
    FROM public.orders o LEFT JOIN public.order_items i ON i.order_id = o.id
    WHERE o.service_date = (now() AT TIME ZONE 'America/La_Paz')::date
      OR (o.paid_at IS NULL AND o.status <> 'anulado')
    GROUP BY o.id ORDER BY (o.paid_at IS NULL AND o.status <> 'anulado') DESC, o.id DESC LIMIT 100`
  return Response.json({ orders }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request): Promise<Response> {
  const access = await authorize(request)
  if (!access || access.staff.role === 'cocina') return noAccess()
  let body: { cash_session_id?: unknown; items?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Datos inválidos' }, { status: 400 }) }
  if (!Number.isSafeInteger(body.cash_session_id) ||
      !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50 ||
      !body.items.every((item: unknown) => item !== null && typeof item === 'object' &&
        Number.isSafeInteger((item as { product_id?: unknown }).product_id) &&
        Number.isSafeInteger((item as { quantity?: unknown }).quantity) &&
        Number((item as { quantity?: unknown }).quantity) >= 1 && Number((item as { quantity?: unknown }).quantity) <= 99)) {
    return Response.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  try {
    const rows = await access.sql`SELECT public.create_pending_order(
      ${Number(body.cash_session_id)}, ${access.staff.user_id}, ${JSON.stringify(body.items)}::jsonb
    ) AS id`
    const order = await access.sql`SELECT id, service_date, ticket_number, payment_method, paid_at, total_cents, status, created_at
      FROM public.orders WHERE id = ${rows[0].id}`
    const items = await access.sql`SELECT product_name AS name,presentation,quantity,unit_price_cents,line_total_cents
      FROM public.order_items WHERE order_id=${rows[0].id} ORDER BY id`
    return Response.json({ order: { ...order[0], items } }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'No se pudo emitir la ficha. Revisa caja y productos.' }, { status: 409 })
  }
}
