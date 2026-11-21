import { authorize, noAccess } from '../lib/serverAuth.js'

export async function POST(request: Request): Promise<Response> {
  const access = await authorize(request)
  if (!access || access.staff.role === 'cocina') return noAccess()
  let body: { order_id?: unknown; cash_session_id?: unknown; items?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Datos inválidos' }, { status: 400 }) }
  if (!Number.isSafeInteger(body.order_id) || Number(body.order_id) <= 0 ||
      !Number.isSafeInteger(body.cash_session_id) || Number(body.cash_session_id) <= 0 ||
      !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50 ||
      !body.items.every((item: unknown) => item !== null && typeof item === 'object' &&
        Number.isSafeInteger((item as { product_id?: unknown }).product_id) &&
        Number((item as { product_id?: unknown }).product_id) > 0 &&
        Number.isSafeInteger((item as { quantity?: unknown }).quantity) &&
        Number((item as { quantity?: unknown }).quantity) >= 1 &&
        Number((item as { quantity?: unknown }).quantity) <= 99)) {
    return Response.json({ error: 'Productos inválidos' }, { status: 400 })
  }
  try {
    const rows = await access.sql`SELECT public.add_items_to_order(
      ${Number(body.order_id)}, ${Number(body.cash_session_id)}, ${access.staff.user_id},
      ${JSON.stringify(body.items)}::jsonb
    ) AS id`
    const order = await access.sql`SELECT id, service_date, ticket_number, table_number, payment_method, paid_at, total_cents, status, created_at
      FROM public.orders WHERE id = ${rows[0].id}`
    const items = await access.sql`SELECT product_name AS name,presentation,quantity,unit_price_cents,line_total_cents
      FROM public.order_items WHERE order_id=${rows[0].id} ORDER BY id`
    return Response.json({ order: { ...order[0], items } }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'No se pudo agregar productos. Revisa que el pedido siga pendiente y la caja esté abierta.' }, { status: 409 })
  }
}
