import { neon } from '@neondatabase/serverless'

export async function GET(): Promise<Response> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    return Response.json({ error: 'Servicio no disponible' }, { status: 503 })
  }

  try {
    const sql = neon(connectionString)
    const products = await sql`
      SELECT id, category, name, presentation, price_cents
      FROM public.products
      WHERE active = true
      ORDER BY category, name, presentation
    `
    return Response.json({ products }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'Servicio no disponible' }, { status: 503 })
  }
}
