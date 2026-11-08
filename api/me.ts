import { authorize, noAccess } from '../lib/serverAuth.js'

export async function GET(request: Request): Promise<Response> {
  const access = await authorize(request)
  return access
    ? Response.json({ staff: access.staff }, { headers: { 'Cache-Control': 'no-store' } })
    : noAccess()
}
