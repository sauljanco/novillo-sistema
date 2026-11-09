import { authorize, noAccess } from '../lib/serverAuth.js'

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
const bad = (message: string) => reply({ error: message }, 400)
const text = (value: unknown, max = 120) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const id = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0
const cents = (value: unknown, positive = false) => Number.isSafeInteger(Number(value)) && Number(value) >= (positive ? 1 : 0) && Number(value) <= 100000000 ? Number(value) : -1
const qty = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 1000000 ? Number(value) : 0
const isoDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : ''

export async function GET(request: Request): Promise<Response> {
  const access = await authorize(request)
  if (!access || !['superadministrador', 'administrador'].includes(access.staff.role)) return noAccess()
  const sql = access.sql
  const panel = new URL(request.url).searchParams.get('panel')
  try {
    switch (panel) {
      case 'resumen': {
        const [sales, sessions, purchases, payroll, lowStock] = await Promise.all([
          sql`SELECT count(*)::integer AS tickets, COALESCE(sum(total_cents) FILTER (WHERE status <> 'anulado'),0)::integer AS sales_cents,
            COALESCE(sum(total_cents) FILTER (WHERE payment_method='efectivo' AND status <> 'anulado'),0)::integer AS cash_cents,
            COALESCE(sum(total_cents) FILTER (WHERE payment_method='qr' AND status <> 'anulado'),0)::integer AS qr_cents
            FROM public.orders WHERE service_date=(now() AT TIME ZONE 'America/La_Paz')::date`,
          sql`SELECT s.id,s.opened_at,s.closed_at,s.opening_cash_cents,s.counted_cash_cents,
            COALESCE(sum(o.total_cents) FILTER (WHERE o.payment_method='efectivo' AND o.status<>'anulado'),0)::integer AS cash_sales_cents,
            COALESCE(sum(o.total_cents) FILTER (WHERE o.payment_method='qr' AND o.status<>'anulado'),0)::integer AS qr_sales_cents
            FROM public.cash_sessions s LEFT JOIN public.orders o ON o.cash_session_id=s.id
            GROUP BY s.id ORDER BY s.id DESC LIMIT 12`,
          sql`SELECT COALESCE(sum(amount_cents),0)::integer AS amount_cents FROM public.purchases
            WHERE (purchased_at AT TIME ZONE 'America/La_Paz')::date=(now() AT TIME ZONE 'America/La_Paz')::date`,
          sql`SELECT COALESCE(sum(amount_cents),0)::integer AS amount_cents FROM public.payroll_payments
            WHERE (paid_at AT TIME ZONE 'America/La_Paz')::date=(now() AT TIME ZONE 'America/La_Paz')::date`,
          sql`SELECT count(*)::integer AS count FROM public.inventory_items WHERE active AND quantity<=minimum_quantity`,
        ])
        return reply({ sales: sales[0], sessions, purchases: purchases[0], payroll: payroll[0], lowStock: lowStock[0] })
      }
      case 'personal': {
        const [employees, shifts, attendance, payments] = await Promise.all([
          sql`SELECT e.*, COALESCE(a.earned,0)::integer AS earned_cents, COALESCE(p.paid,0)::integer AS paid_cents
            FROM public.employees e
            LEFT JOIN (SELECT employee_id,sum(earned_cents) earned FROM public.attendance GROUP BY employee_id) a ON a.employee_id=e.id
            LEFT JOIN (SELECT employee_id,sum(amount_cents) paid FROM public.payroll_payments GROUP BY employee_id) p ON p.employee_id=e.id
            ORDER BY e.active DESC,e.full_name`,
          sql`SELECT s.*,e.full_name FROM public.work_shifts s JOIN public.employees e ON e.id=s.employee_id
            WHERE s.work_date BETWEEN (now() AT TIME ZONE 'America/La_Paz')::date - 7
              AND (now() AT TIME ZONE 'America/La_Paz')::date + 30 ORDER BY s.work_date,s.id LIMIT 150`,
          sql`SELECT a.*,e.full_name FROM public.attendance a JOIN public.employees e ON e.id=a.employee_id
            ORDER BY a.work_date DESC,a.id DESC LIMIT 100`,
          sql`SELECT p.*,e.full_name FROM public.payroll_payments p JOIN public.employees e ON e.id=p.employee_id
            ORDER BY p.paid_at DESC LIMIT 100`,
        ])
        return reply({ employees, shifts, attendance, payments })
      }
      case 'inventario': {
        const [items, movements] = await Promise.all([
          sql`SELECT * FROM public.inventory_items ORDER BY active DESC,name`,
          sql`SELECT m.*,i.name,i.unit FROM public.stock_movements m JOIN public.inventory_items i ON i.id=m.inventory_item_id
            ORDER BY m.created_at DESC LIMIT 100`,
        ])
        return reply({ items, movements })
      }
      case 'compras': {
        const [suppliers, purchases, items] = await Promise.all([
          sql`SELECT * FROM public.suppliers ORDER BY active DESC,name`,
          sql`SELECT p.*,s.name AS supplier_name,i.name AS item_name FROM public.purchases p
            LEFT JOIN public.suppliers s ON s.id=p.supplier_id LEFT JOIN public.inventory_items i ON i.id=p.inventory_item_id
            ORDER BY p.purchased_at DESC LIMIT 150`,
          sql`SELECT id,name,unit FROM public.inventory_items WHERE active ORDER BY name`,
        ])
        return reply({ suppliers, purchases, items })
      }
      case 'catalogo': return reply({ products: await sql`SELECT id,category,name,presentation,price_cents,active,created_at,updated_at,
        CASE WHEN image_data IS NOT NULL THEN '/api/product-image?id=' || id::text || '&v=' || extract(epoch from updated_at)::bigint::text ELSE NULL END AS image_url
        FROM public.products WHERE deleted_at IS NULL ORDER BY active DESC,category,name,presentation` })
      case 'accesos': {
        if (access.staff.role !== 'superadministrador') return noAccess()
        const [users, invites] = await Promise.all([
          sql`SELECT u.id,u.name,u.email,u."emailVerified",s.role,s.active
            FROM neon_auth."user" u LEFT JOIN public.staff_access s ON s.user_id=u.id::text ORDER BY u."createdAt" DESC LIMIT 100`,
          sql`SELECT id,email,display_name,role,status,created_at,expires_at,accepted_at
            FROM public.staff_invites ORDER BY id DESC LIMIT 100`,
        ])
        return reply({ users, invites })
      }
      case 'reportes': {
        const [daily, status, cash, payroll, purchases] = await Promise.all([
          sql`SELECT service_date,count(*)::integer AS tickets,
            COALESCE(sum(total_cents) FILTER (WHERE status<>'anulado'),0)::integer AS sales_cents,
            COALESCE(sum(total_cents) FILTER (WHERE payment_method='efectivo' AND status<>'anulado'),0)::integer AS cash_cents,
            COALESCE(sum(total_cents) FILTER (WHERE payment_method='qr' AND status<>'anulado'),0)::integer AS qr_cents
            FROM public.orders WHERE service_date >= (now() AT TIME ZONE 'America/La_Paz')::date - 30
            GROUP BY service_date ORDER BY service_date DESC`,
          sql`SELECT status,count(*)::integer AS count FROM public.orders
            WHERE service_date >= (now() AT TIME ZONE 'America/La_Paz')::date - 30 GROUP BY status`,
          sql`SELECT s.id,s.opened_at,s.closed_at,s.opening_cash_cents,s.counted_cash_cents,
            COALESCE(sum(o.total_cents) FILTER (WHERE o.payment_method='efectivo' AND o.status<>'anulado'),0)::integer AS cash_sales_cents,
            COALESCE(sum(o.total_cents) FILTER (WHERE o.payment_method='qr' AND o.status<>'anulado'),0)::integer AS qr_sales_cents
            FROM public.cash_sessions s LEFT JOIN public.orders o ON o.cash_session_id=s.id
            GROUP BY s.id ORDER BY s.id DESC LIMIT 30`,
          sql`SELECT COALESCE(sum(earned_cents),0)::integer AS earned_cents FROM public.attendance
            WHERE work_date >= (now() AT TIME ZONE 'America/La_Paz')::date - 30`,
          sql`SELECT category,payment_status,COALESCE(sum(amount_cents),0)::integer AS amount_cents
            FROM public.purchases WHERE purchased_at >= now()-interval '30 days' GROUP BY category,payment_status`,
        ])
        return reply({ daily, status, cash, payroll: payroll[0], purchases })
      }
      default: return bad('Panel desconocido')
    }
  } catch { return reply({ error: 'No se pudo cargar el panel' }, 500) }
}

export async function POST(request: Request): Promise<Response> {
  const access = await authorize(request)
  if (!access || !['superadministrador', 'administrador'].includes(access.staff.role)) return noAccess()
  const sql = access.sql
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return bad('Datos inválidos') }
  const action = text(body.action, 40)
  try {
    switch (action) {
      case 'employee': {
        const name = text(body.full_name), title = text(body.job_title, 80)
        const daily = cents(body.daily_rate_cents), half = cents(body.half_day_rate_cents)
        if (!name || daily < 0 || half < 0) return bad('Datos de personal inválidos')
        const rows = id(body.id)
          ? await sql`UPDATE public.employees SET full_name=${name},job_title=${title},daily_rate_cents=${daily},half_day_rate_cents=${half},active=${body.active !== false} WHERE id=${id(body.id)} RETURNING id`
          : await sql`INSERT INTO public.employees(full_name,job_title,daily_rate_cents,half_day_rate_cents) VALUES(${name},${title},${daily},${half}) RETURNING id`
        return reply({ id: rows[0]?.id }, 201)
      }
      case 'shift': {
        const day = isoDate(body.work_date), shift = text(body.shift, 20)
        if (!id(body.employee_id) || !day || !['dia','medio_dia','noche'].includes(shift)) return bad('Turno inválido')
        const rows = await sql`INSERT INTO public.work_shifts(employee_id,work_date,shift,note)
          VALUES(${id(body.employee_id)},${day},${shift},${text(body.note, 300)})
          ON CONFLICT(employee_id,work_date,shift) DO UPDATE SET note=excluded.note RETURNING id`
        return reply({ id: rows[0].id }, 201)
      }
      case 'attendance': {
        const day = isoDate(body.work_date), kind = text(body.work_type, 20)
        if (!id(body.employee_id) || !day || !['dia','medio_dia'].includes(kind)) return bad('Asistencia inválida')
        const rows = await sql`INSERT INTO public.attendance(employee_id,work_date,work_type,earned_cents,note,recorded_by)
          SELECT e.id,${day},${kind},CASE WHEN ${kind}='dia' THEN e.daily_rate_cents ELSE e.half_day_rate_cents END,
            ${text(body.note, 300)},${access.staff.user_id} FROM public.employees e WHERE e.id=${id(body.employee_id)} AND e.active
          ON CONFLICT(employee_id,work_date) DO UPDATE SET work_type=excluded.work_type,
            earned_cents=excluded.earned_cents,note=excluded.note,recorded_by=excluded.recorded_by RETURNING id`
        if (!rows.length) return bad('Empleado inactivo o inexistente')
        return reply({ id: rows[0].id }, 201)
      }
      case 'payment': {
        const amount = cents(body.amount_cents, true), kind = text(body.payment_type, 20), method = text(body.payment_method, 20)
        if (!id(body.employee_id) || amount < 0 || !['sueldo','adelanto'].includes(kind) || !['efectivo','qr'].includes(method)) return bad('Pago inválido')
        const rows = await sql`INSERT INTO public.payroll_payments(employee_id,amount_cents,payment_type,payment_method,note,recorded_by)
          VALUES(${id(body.employee_id)},${amount},${kind},${method},${text(body.note, 300)},${access.staff.user_id}) RETURNING id`
        return reply({ id: rows[0].id }, 201)
      }
      case 'supplier': {
        const name = text(body.name), contact = text(body.contact, 150), note = text(body.note, 300)
        if (!name) return bad('Nombre de proveedor obligatorio')
        const rows = id(body.id)
          ? await sql`UPDATE public.suppliers SET name=${name},contact=${contact},note=${note},active=${body.active !== false} WHERE id=${id(body.id)} RETURNING id`
          : await sql`INSERT INTO public.suppliers(name,contact,note) VALUES(${name},${contact},${note}) RETURNING id`
        return reply({ id: rows[0]?.id }, 201)
      }
      case 'item': {
        const name = text(body.name), unit = text(body.unit, 30), minimum = Number(body.minimum_quantity)
        if (!name || !unit || !Number.isFinite(minimum) || minimum < 0 || minimum > 1000000) return bad('Artículo inválido')
        const rows = id(body.id)
          ? await sql`UPDATE public.inventory_items SET name=${name},unit=${unit},minimum_quantity=${minimum},active=${body.active !== false} WHERE id=${id(body.id)} RETURNING id`
          : await sql`INSERT INTO public.inventory_items(name,unit,minimum_quantity) VALUES(${name},${unit},${minimum}) RETURNING id`
        return reply({ id: rows[0]?.id }, 201)
      }
      case 'stock': {
        const delta = Number(body.quantity_delta), reason = text(body.reason, 20)
        if (!id(body.inventory_item_id) || !Number.isFinite(delta) || delta === 0 || Math.abs(delta)>1000000 || !['ajuste','consumo','merma'].includes(reason)) return bad('Movimiento inválido')
        const rows = await sql`SELECT public.adjust_stock(${id(body.inventory_item_id)},${delta},${reason},${text(body.note, 300)},${access.staff.user_id}) AS quantity`
        return reply({ quantity: rows[0].quantity }, 201)
      }
      case 'purchase': {
        const category = text(body.category, 20), status = text(body.payment_status, 20), amount = cents(body.amount_cents, true)
        const description = text(body.description, 300), itemId = id(body.inventory_item_id), quantity = qty(body.quantity)
        if (!['insumo','inversion','gasto'].includes(category) || !['pagado','pendiente'].includes(status) || amount < 0 || !description || (category === 'insumo' && (!itemId || !quantity))) return bad('Compra inválida')
        const rows = await sql`SELECT public.record_purchase(${id(body.supplier_id) || null},${category==='insumo'?itemId:null},
          ${category==='insumo'?quantity:null},${amount},${category},${description},${status},${access.staff.user_id}) AS id`
        return reply({ id: rows[0].id }, 201)
      }
      case 'product': {
        const category = text(body.category, 80), name = text(body.name), presentation = text(body.presentation, 80), price = cents(body.price_cents)
        if (!category || !name || !presentation || price < 0) return bad('Producto inválido')
        const rows = id(body.id)
          ? await sql`UPDATE public.products SET category=${category},name=${name},presentation=${presentation},price_cents=${price},active=${body.active !== false},updated_at=now() WHERE id=${id(body.id)} AND deleted_at IS NULL RETURNING id`
          : await sql`INSERT INTO public.products(category,name,presentation,price_cents) VALUES(${category},${name},${presentation},${price}) RETURNING id`
        return reply({ id: rows[0]?.id }, 201)
      }
      case 'delete_product': {
        const productId = id(body.id)
        if (!productId) return bad('Producto inválido')
        const rows = await sql`UPDATE public.products SET active=false,deleted_at=now(),updated_at=now()
          WHERE id=${productId} AND deleted_at IS NULL RETURNING id`
        if (!rows.length) return reply({ error: 'Producto inexistente' }, 404)
        return reply({ id: rows[0].id })
      }
      case 'access': {
        if (access.staff.role !== 'superadministrador') return noAccess()
        const userId = text(body.user_id, 100), role = text(body.role, 30)
        if (!userId || userId === access.staff.user_id || !['administrador','caja','cocina'].includes(role)) return bad('Acceso inválido')
        const rows = await sql`INSERT INTO public.staff_access(user_id,display_name,role,active)
          SELECT u.id::text,u.name,${role},${body.active !== false} FROM neon_auth."user" u
          WHERE u.id::text=${userId} AND u."emailVerified"=true
          ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,active=excluded.active,display_name=excluded.display_name
          WHERE staff_access.role<>'superadministrador' RETURNING user_id`
        if (!rows.length) return bad('Cuenta no verificada o protegida')
        return reply({ user_id: rows[0].user_id }, 201)
      }
      case 'invite': {
        if (access.staff.role !== 'superadministrador') return noAccess()
        const email = text(body.email, 254).toLowerCase()
        const name = text(body.display_name, 120)
        const role = text(body.role, 30)
        if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['administrador','caja'].includes(role)) return bad('Nombre, correo o rol inválido')
        const existing = await sql`SELECT s.user_id FROM public.staff_access s
          JOIN neon_auth."user" u ON u.id::text=s.user_id WHERE lower(u.email)=${email} LIMIT 1`
        if (existing.length) return reply({ error: 'La cuenta ya tiene acceso. Edita su rol en la lista de usuarios.' }, 409)
        const rows = await sql`INSERT INTO public.staff_invites(email,display_name,role,created_by)
          VALUES(${email},${name},${role},${access.staff.user_id})
          ON CONFLICT(email) WHERE status='pendiente' DO UPDATE SET
            display_name=excluded.display_name,role=excluded.role,created_by=excluded.created_by,
            created_at=now(),expires_at=now()+interval '7 days'
          RETURNING id,email,role,expires_at`
        return reply({ invite: rows[0] }, 201)
      }
      case 'revoke_invite': {
        if (access.staff.role !== 'superadministrador') return noAccess()
        if (!id(body.invite_id)) return bad('Invitación inválida')
        const rows = await sql`UPDATE public.staff_invites SET status='revocada'
          WHERE id=${id(body.invite_id)} AND status='pendiente' RETURNING id`
        if (!rows.length) return reply({ error: 'La invitación ya no está pendiente' }, 409)
        return reply({ id: rows[0].id })
      }
      default: return bad('Acción desconocida')
    }
  } catch { return reply({ error: 'No se pudo guardar. Revisa los datos o registros duplicados.' }, 409) }
}
