import { neon } from '@neondatabase/serverless'
import { authorize, noAccess } from '../lib/serverAuth.js'

const productId = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0

export async function GET(request: Request): Promise<Response> {
  const id = productId(new URL(request.url).searchParams.get('id'))
  if (!id || !process.env.DATABASE_URL) return new Response(null, { status: 404 })
  try {
    const sql = neon(process.env.DATABASE_URL)
    const rows = await sql`SELECT encode(image_data, 'base64') AS image, image_mime
      FROM public.products WHERE id=${id} AND deleted_at IS NULL AND image_data IS NOT NULL`
    if (!rows.length) return new Response(null, { status: 404 })
    return new Response(Buffer.from(String(rows[0].image), 'base64'), {
      headers: { 'Content-Type': String(rows[0].image_mime || 'image/webp'), 'Cache-Control': 'public, max-age=86400' },
    })
  } catch { return new Response(null, { status: 503 }) }
}

export async function POST(request: Request): Promise<Response> {
  const access = await authorize(request)
  if (!access || !['superadministrador', 'administrador'].includes(access.staff.role)) return noAccess()
  let body: { product_id?: unknown; image?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Imagen inválida' }, { status: 400 }) }
  const id = productId(body.product_id)
  const image = typeof body.image === 'string' ? body.image : ''
  const match = /^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/.exec(image)
  if (!id || !match || match[1].length > 960000) return Response.json({ error: 'Usa una imagen WebP de hasta 700 KB' }, { status: 400 })
  try {
    const rows = await access.sql`UPDATE public.products
      SET image_data=decode(${match[1]}, 'base64'), image_mime='image/webp', updated_at=now()
      WHERE id=${id} AND deleted_at IS NULL RETURNING id`
    if (!rows.length) return Response.json({ error: 'Producto inexistente' }, { status: 404 })
    return Response.json({ id: rows[0].id })
  } catch { return Response.json({ error: 'No se pudo guardar la imagen' }, { status: 500 }) }
}
