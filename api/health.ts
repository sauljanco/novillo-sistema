import { neon } from '@neondatabase/serverless'

const headers = { 'Cache-Control': 'no-store' }

export async function GET(): Promise<Response> {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    return Response.json({ status: 'unavailable' }, { status: 503, headers })
  }

  try {
    const sql = neon(connectionString)
    const rows = await sql`SELECT 1 AS connected`

    if (rows[0]?.connected !== 1) {
      return Response.json({ status: 'unavailable' }, { status: 503, headers })
    }

    return Response.json({ status: 'ok' }, { headers })
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503, headers })
  }
}
