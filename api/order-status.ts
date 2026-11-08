import { authorize, noAccess } from '../lib/serverAuth.js'

export async function POST(request: Request): Promise<Response> {
  const access = await authorize(request)
  if (!access || !['superadministrador','administrador','cocina'].includes(access.staff.role)) return noAccess()
  let body: { order_id?: unknown; status?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Datos inválidos' }, { status: 400 }) }
  const orderId = Number(body.order_id)
  const status = String(body.status)
  if (!Number.isSafeInteger(orderId) || orderId <= 0 || !['preparando','listo','entregado'].includes(status)) {
    return Response.json({ error: 'Estado inválido' }, { status: 400 })
  }
  try {
    const rows = await access.sql`UPDATE public.orders SET status=${status}
      WHERE id=${orderId} AND service_date=(now() AT TIME ZONE 'America/La_Paz')::date
        AND ((status='pendiente' AND ${status}='preparando')
          OR (status='preparando' AND ${status}='listo')
          OR (status='listo' AND ${status}='entregado'))
      RETURNING id,status,ticket_number`
    if (!rows.length) return Response.json({ error: 'La ficha ya cambió de estado o no está disponible' }, { status: 409 })
    return Response.json({ order: rows[0] }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return Response.json({ error: 'No se pudo actualizar la ficha' }, { status: 500 }) }
}
