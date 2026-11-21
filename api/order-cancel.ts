import { authorize, noAccess } from '../lib/serverAuth.js'

export async function POST(request: Request): Promise<Response> {
  const access = await authorize(request)
  if (!access || access.staff.role === 'cocina') return noAccess()
  let body: { order_id?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Datos inválidos' }, { status: 400 }) }
  const orderId = Number(body.order_id)
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    return Response.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  try {
    const rows = await access.sql`UPDATE public.orders
      SET status='anulado', canceled_at=now(), canceled_by=${access.staff.user_id}
      WHERE id=${orderId} AND paid_at IS NULL AND status <> 'anulado'
      RETURNING id, ticket_number, status`
    if (!rows.length) return Response.json({ error: 'Solo se puede cancelar un pedido pendiente de cobro.' }, { status: 409 })
    return Response.json({ order: rows[0] }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'No se pudo cancelar el pedido.' }, { status: 500 })
  }
}
