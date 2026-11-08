import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { authorizedFetch } from './auth'
import './admin.css'

type Row = Record<string, any>
type Data = Record<string, any>
const money = (value: unknown) => `Bs ${(Number(value || 0) / 100).toFixed(2)}`
const date = (value: unknown) => value ? new Date(String(value)).toLocaleDateString('es-BO', { timeZone: 'UTC' }) : '—'
const dateTime = (value: unknown) => value ? new Date(String(value)).toLocaleString('es-BO', { timeZone: 'America/La_Paz' }) : '—'
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' })

export const adminTabs = [
  ['resumen', 'Resumen'], ['personal', 'Personal'], ['inventario', 'Inventario'],
  ['compras', 'Compras e inversión'], ['catalogo', 'Catálogo'], ['reportes', 'Reportes'], ['accesos', 'Accesos'],
] as const

function rows(data: Data, key: string): Row[] { return Array.isArray(data[key]) ? data[key] : [] }
function SelectRows({ name, list, label = 'Seleccionar', optional = false }: { name: string; list: Row[]; label?: string; optional?: boolean }) {
  return <select name={name} required={!optional} defaultValue=""><option value="">{label}</option>{list.filter((item) => item.active !== false).map((item) => <option key={item.id} value={item.id}>{item.full_name || item.name}{item.unit ? ` · ${item.unit}` : ''}</option>)}</select>
}
function Table({ headings, entries }: { headings: string[]; entries: (string | number | ReactNode)[][] }) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{headings.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{entries.length ? entries.map((cells, index) => <tr key={index}>{cells.map((cell, n) => <td key={n}>{cell}</td>)}</tr>) : <tr><td colSpan={headings.length}>Sin registros todavía.</td></tr>}</tbody></table></div>
}

export function AdminPanels({ panel, isSuper }: { panel: string; isSuper: boolean }) {
  const [data, setData] = useState<Data>({})
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<Row | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true); setNotice(''); setEditing(null)
    authorizedFetch(`/api/admin?panel=${encodeURIComponent(panel)}`)
      .then(async (response) => { if (!response.ok) throw new Error(`No se pudo cargar ${panel} (HTTP ${response.status}).`); return response.json() })
      .then((result) => { if (active) { setData(result); setLoading(false) } })
      .catch((error) => { if (active) { setNotice(error.message); setLoading(false) } })
    return () => { active = false }
  }, [panel, version])

  async function save(event: FormEvent<HTMLFormElement>, action: string, closeEdit = false) {
    event.preventDefault()
    const form = event.currentTarget
    const body: Record<string, unknown> = { action }
    for (const [key, value] of new FormData(form).entries()) {
      if (key.endsWith('_cents')) body[key] = Math.round(Number(value) * 100)
      else if (['id','employee_id','inventory_item_id','supplier_id','quantity','quantity_delta','minimum_quantity'].includes(key)) body[key] = value === '' ? null : Number(value)
      else if (key === 'active') body[key] = value === 'true'
      else body[key] = value
    }
    try {
      const response = await authorizedFetch('/api/admin', { method: 'POST', body: JSON.stringify(body) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar')
      setNotice('Guardado correctamente.')
      if (closeEdit) setEditing(null)
      form.reset()
      setVersion((n) => n + 1)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo guardar') }
  }

  if (loading) return <p role="status">Cargando {panel}…</p>
  const employees = rows(data, 'employees'), items = rows(data, 'items'), suppliers = rows(data, 'suppliers')
  return <div className="admin-panel">
    {notice && <p className="notice" role="status">{notice}</p>}
    {panel === 'resumen' && <>
      <h2>Resumen del negocio</h2><p className="panel-subtitle">Operación de hoy · hora de Bolivia</p>
      <div className="metric-grid">
        <div><small>Ventas</small><strong>{money(data.sales?.sales_cents)}</strong></div>
        <div><small>Fichas</small><strong>{data.sales?.tickets ?? 0}</strong></div>
        <div><small>Efectivo</small><strong>{money(data.sales?.cash_cents)}</strong></div>
        <div><small>QR</small><strong>{money(data.sales?.qr_cents)}</strong></div>
        <div><small>Compras de hoy</small><strong>{money(data.purchases?.amount_cents)}</strong></div>
        <div><small>Sueldos pagados hoy</small><strong>{money(data.payroll?.amount_cents)}</strong></div>
        <div><small>Artículos en mínimo</small><strong>{data.lowStock?.count ?? 0}</strong></div>
      </div>
      <h3>Últimos arqueos</h3><Table headings={['Caja','Apertura','Cierre','Fondo','Ventas efectivo','Ventas QR','Contado','Diferencia']} entries={rows(data,'sessions').map((s) => [s.id,dateTime(s.opened_at),dateTime(s.closed_at),money(s.opening_cash_cents),money(s.cash_sales_cents),money(s.qr_sales_cents),s.closed_at?money(s.counted_cash_cents):'Abierta',s.closed_at?money(Number(s.counted_cash_cents)-Number(s.opening_cash_cents)-Number(s.cash_sales_cents)):'—'])} />
    </>}
    {panel === 'personal' && <>
      <h2>Personal y planilla</h2><p className="panel-subtitle">Programa turnos, registra jornadas trabajadas y controla adelantos y pagos.</p>
      <div className="admin-form-grid">
        <form key={`employee-${editing?.id || 'new'}`} onSubmit={(e) => save(e,'employee',true)} className="admin-form"><h3>{editing ? 'Editar empleado' : 'Nuevo empleado'}</h3>{editing && <input type="hidden" name="id" value={editing.id} />}
          <label>Nombre<input name="full_name" required defaultValue={editing?.full_name || ''} /></label><label>Cargo<input name="job_title" defaultValue={editing?.job_title || ''} /></label>
          <label>Tarifa día (Bs)<input name="daily_rate_cents" type="number" min="0" step="0.01" required defaultValue={editing ? Number(editing.daily_rate_cents)/100 : ''} /></label>
          <label>Tarifa medio turno (Bs)<input name="half_day_rate_cents" type="number" min="0" step="0.01" required defaultValue={editing ? Number(editing.half_day_rate_cents)/100 : ''} /></label>
          {editing && <label>Estado<select name="active" defaultValue={String(editing.active)}><option value="true">Activo</option><option value="false">Inactivo</option></select></label>}
          <button>Guardar empleado</button>{editing && <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button>}</form>
        <form onSubmit={(e) => save(e,'shift')} className="admin-form"><h3>Programar turno</h3><label>Empleado<SelectRows name="employee_id" list={employees} /></label><label>Fecha<input name="work_date" type="date" required defaultValue={today()} /></label><label>Turno<select name="shift"><option value="dia">Día completo</option><option value="medio_dia">Medio turno</option><option value="noche">Noche</option></select></label><label>Condiciones o nota<input name="note" /></label><button>Programar</button></form>
        <form onSubmit={(e) => save(e,'attendance')} className="admin-form"><h3>Trabajo realizado</h3><label>Empleado<SelectRows name="employee_id" list={employees} /></label><label>Fecha<input name="work_date" type="date" required defaultValue={today()} /></label><label>Jornada<select name="work_type"><option value="dia">Día completo</option><option value="medio_dia">Medio turno</option></select></label><label>Nota<input name="note" /></label><button>Registrar asistencia</button></form>
        <form onSubmit={(e) => save(e,'payment')} className="admin-form"><h3>Registrar pago</h3><label>Empleado<SelectRows name="employee_id" list={employees} /></label><label>Importe (Bs)<input name="amount_cents" type="number" step="0.01" min="0.01" required /></label><label>Tipo<select name="payment_type"><option value="sueldo">Sueldo</option><option value="adelanto">Adelanto</option></select></label><label>Medio<select name="payment_method"><option value="efectivo">Efectivo</option><option value="qr">QR</option></select></label><label>Nota<input name="note" /></label><button>Guardar pago</button></form>
      </div>
      <h3>Empleados y saldo</h3><Table headings={['Nombre','Cargo','Día','Medio turno','Devengado','Pagado','Saldo','Estado','']} entries={employees.map((e) => [e.full_name,e.job_title,money(e.daily_rate_cents),money(e.half_day_rate_cents),money(e.earned_cents),money(e.paid_cents),money(Number(e.earned_cents)-Number(e.paid_cents)),e.active?'Activo':'Inactivo',<button className="table-action" onClick={() => setEditing(e)}>Editar</button>])} />
      <h3>Turnos programados</h3><Table headings={['Fecha','Empleado','Turno','Condiciones']} entries={rows(data,'shifts').map((s) => [date(s.work_date),s.full_name,s.shift,s.note])} />
      <h3>Asistencia real</h3><Table headings={['Fecha','Empleado','Jornada','Devengado','Nota']} entries={rows(data,'attendance').map((a) => [date(a.work_date),a.full_name,a.work_type,money(a.earned_cents),a.note])} />
      <h3>Pagos y adelantos</h3><Table headings={['Fecha','Empleado','Tipo','Medio','Importe','Nota']} entries={rows(data,'payments').map((p) => [dateTime(p.paid_at),p.full_name,p.payment_type,p.payment_method,money(p.amount_cents),p.note])} />
    </>}
    {panel === 'inventario' && <>
      <h2>Inventario</h2><p className="panel-subtitle">Existencias, mínimos y movimientos de entrada o salida.</p>
      <div className="admin-form-grid">
        <form key={`item-${editing?.id || 'new'}`} onSubmit={(e) => save(e,'item',true)} className="admin-form"><h3>{editing ? 'Editar artículo' : 'Nuevo artículo'}</h3>{editing && <input type="hidden" name="id" value={editing.id} />}<label>Nombre<input name="name" required defaultValue={editing?.name || ''} /></label><label>Unidad<input name="unit" required placeholder="kg, unidad, litro…" defaultValue={editing?.unit || ''} /></label><label>Mínimo<input name="minimum_quantity" type="number" step="0.001" min="0" required defaultValue={editing?.minimum_quantity || 0} /></label>{editing && <label>Estado<select name="active" defaultValue={String(editing.active)}><option value="true">Activo</option><option value="false">Inactivo</option></select></label>}<button>Guardar artículo</button>{editing && <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button>}</form>
        <form onSubmit={(e) => save(e,'stock')} className="admin-form"><h3>Ajustar existencia</h3><label>Artículo<SelectRows name="inventory_item_id" list={items} /></label><label>Variación<input name="quantity_delta" type="number" step="0.001" required placeholder="+5 o -2" /></label><label>Motivo<select name="reason"><option value="ajuste">Ajuste</option><option value="consumo">Consumo</option><option value="merma">Merma</option></select></label><label>Detalle<input name="note" /></label><button>Registrar movimiento</button></form>
      </div><h3>Existencias</h3><Table headings={['Artículo','Unidad','Cantidad','Mínimo','Estado','']} entries={items.map((i) => [i.name,i.unit,i.quantity,i.minimum_quantity,!i.active?'Inactivo':Number(i.quantity)<=Number(i.minimum_quantity)?'Bajo mínimo':'Normal',<button className="table-action" onClick={() => setEditing(i)}>Editar</button>])} />
      <h3>Movimientos recientes</h3><Table headings={['Fecha','Artículo','Variación','Motivo','Detalle']} entries={rows(data,'movements').map((m) => [dateTime(m.created_at),m.name,`${m.quantity_delta} ${m.unit}`,m.reason,m.note])} />
    </>}
    {panel === 'compras' && <>
      <h2>Compras e inversión</h2><p className="panel-subtitle">Separa insumos de equipos e inversiones y registra importes pendientes.</p>
      <div className="admin-form-grid">
        <form key={`supplier-${editing?.id || 'new'}`} onSubmit={(e) => save(e,'supplier',true)} className="admin-form"><h3>{editing ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>{editing && <input type="hidden" name="id" value={editing.id} />}<label>Nombre<input name="name" required defaultValue={editing?.name || ''} /></label><label>Contacto<input name="contact" defaultValue={editing?.contact || ''} /></label><label>Nota<input name="note" defaultValue={editing?.note || ''} /></label>{editing && <label>Estado<select name="active" defaultValue={String(editing.active)}><option value="true">Activo</option><option value="false">Inactivo</option></select></label>}<button>Guardar proveedor</button>{editing && <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button>}</form>
        <form onSubmit={(e) => save(e,'purchase')} className="admin-form"><h3>Registrar compra o inversión</h3><label>Proveedor<SelectRows name="supplier_id" list={suppliers} optional label="Sin proveedor" /></label><label>Tipo<select name="category"><option value="insumo">Insumo</option><option value="inversion">Inversión / equipo</option><option value="gasto">Gasto</option></select></label><label>Artículo (obligatorio para insumo)<SelectRows name="inventory_item_id" list={items} optional label="Seleccionar si es insumo" /></label><label>Cantidad (solo insumo)<input name="quantity" type="number" step="0.001" min="0" /></label><label>Descripción<input name="description" required /></label><label>Importe (Bs)<input name="amount_cents" type="number" step="0.01" min="0.01" required /></label><label>Pago<select name="payment_status"><option value="pagado">Pagado</option><option value="pendiente">Pendiente</option></select></label><button>Guardar compra</button></form>
      </div><h3>Proveedores</h3><Table headings={['Nombre','Contacto','Nota','Estado','']} entries={suppliers.map((s) => [s.name,s.contact,s.note,s.active?'Activo':'Inactivo',<button className="table-action" onClick={() => setEditing(s)}>Editar</button>])} />
      <h3>Historial</h3><Table headings={['Fecha','Tipo','Proveedor','Descripción','Cantidad','Importe','Pago']} entries={rows(data,'purchases').map((p) => [dateTime(p.purchased_at),p.category,p.supplier_name || '—',p.description,p.item_name ? `${p.quantity} · ${p.item_name}` : '—',money(p.amount_cents),p.payment_status])} />
    </>}
    {panel === 'catalogo' && <>
      <h2>Catálogo de venta</h2><p className="panel-subtitle">Cambios de precio y disponibilidad aplican a los siguientes pedidos.</p>
      <form key={`product-${editing?.id || 'new'}`} onSubmit={(e) => save(e,'product',true)} className="admin-form admin-form-wide"><h3>{editing ? 'Editar producto' : 'Nuevo producto'}</h3>{editing && <input type="hidden" name="id" value={editing.id} />}<label>Categoría<input name="category" required defaultValue={editing?.category || ''} /></label><label>Nombre<input name="name" required defaultValue={editing?.name || ''} /></label><label>Presentación<input name="presentation" required defaultValue={editing?.presentation || ''} /></label><label>Precio (Bs)<input name="price_cents" type="number" step="0.01" min="0" required defaultValue={editing ? Number(editing.price_cents)/100 : ''} /></label>{editing && <label>Estado<select name="active" defaultValue={String(editing.active)}><option value="true">Activo</option><option value="false">Inactivo</option></select></label>}<button>Guardar producto</button>{editing && <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button>}</form>
      <h3>Productos</h3><Table headings={['Categoría','Producto','Presentación','Precio','Estado','']} entries={rows(data,'products').map((p) => [p.category,p.name,p.presentation,money(p.price_cents),p.active?'Activo':'Inactivo',<button className="table-action" onClick={() => setEditing(p)}>Editar</button>])} />
    </>}
    {panel === 'reportes' && <>
      <h2>Reportes</h2><p className="panel-subtitle">Ventas y arqueos de los últimos 30 días; compras y planilla del mismo periodo.</p>
      <div className="metric-grid"><div><small>Jornadas devengadas</small><strong>{money(data.payroll?.earned_cents)}</strong></div>{rows(data,'purchases').map((p) => <div key={`${p.category}-${p.payment_status}`}><small>{p.category} · {p.payment_status}</small><strong>{money(p.amount_cents)}</strong></div>)}</div>
      <h3>Ventas diarias</h3><Table headings={['Fecha','Fichas','Total','Efectivo','QR']} entries={rows(data,'daily').map((d) => [date(d.service_date),d.tickets,money(d.sales_cents),money(d.cash_cents),money(d.qr_cents)])} />
      <h3>Estado de fichas</h3><Table headings={['Estado','Cantidad']} entries={rows(data,'status').map((s) => [s.status,s.count])} />
      <h3>Arqueos</h3><Table headings={['Caja','Apertura','Cierre','Fondo','Efectivo','QR','Contado','Diferencia']} entries={rows(data,'cash').map((s) => [s.id,dateTime(s.opened_at),dateTime(s.closed_at),money(s.opening_cash_cents),money(s.cash_sales_cents),money(s.qr_sales_cents),s.closed_at?money(s.counted_cash_cents):'Abierta',s.closed_at?money(Number(s.counted_cash_cents)-Number(s.opening_cash_cents)-Number(s.cash_sales_cents)):'—'])} />
    </>}
    {panel === 'accesos' && isSuper && <><h2>Accesos del equipo</h2><p className="panel-subtitle">Solo cuentas con correo verificado pueden recibir un rol. Tu acceso de superadministrador queda protegido.</p><Table headings={['Cuenta','Correo','Verificado','Rol','Estado','Acción']} entries={rows(data,'users').map((u) => [u.name,u.email,u.emailVerified?'Sí':'No',u.role || 'Sin acceso',u.active===true?'Activo':'—',u.role==='superadministrador'?'Protegido':<form className="access-form" onSubmit={(e) => save(e,'access')}><input type="hidden" name="user_id" value={u.id} /><select name="role" defaultValue={u.role || 'caja'}><option value="administrador">Administrador</option><option value="caja">Caja</option><option value="cocina">Cocina</option></select><select name="active" defaultValue={String(u.active !== false)}><option value="true">Activo</option><option value="false">Suspendido</option></select><button disabled={!u.emailVerified}>Guardar</button></form>])} /></>}
  </div>
}
