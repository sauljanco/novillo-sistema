import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { authorizedFetch } from './auth'
import { categoriesWithProducts } from './menuCategories'
import './admin.css'
import './menu-admin.css'

type Row = Record<string, any>
type Data = Record<string, any>
type Section = { key: string; label: string; action?: string; actionLabel?: string }

const money = (value: unknown) => `Bs ${(Number(value || 0) / 100).toFixed(2)}`
const date = (value: unknown) => value ? new Date(String(value)).toLocaleDateString('es-BO', { timeZone: 'UTC' }) : '—'
const dateTime = (value: unknown) => value ? new Date(String(value)).toLocaleString('es-BO', { timeZone: 'America/La_Paz' }) : '—'
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' })
const rows = (data: Data, key: string): Row[] => Array.isArray(data[key]) ? data[key] : []

export const adminTabs = [
  ['resumen', 'Resumen'], ['personal', 'Personal'], ['inventario', 'Inventario'],
  ['compras', 'Compras e inversión'], ['catalogo', 'Menú'], ['reportes', 'Reportes'], ['accesos', 'Accesos'],
] as const

const sections: Record<string, Section[]> = {
  personal: [
    { key: 'employees', label: 'Empleados', action: 'employee', actionLabel: 'Agregar empleado' },
    { key: 'shifts', label: 'Turnos', action: 'shift', actionLabel: 'Programar turno' },
    { key: 'attendance', label: 'Asistencia', action: 'attendance', actionLabel: 'Registrar asistencia' },
    { key: 'payments', label: 'Pagos', action: 'payment', actionLabel: 'Registrar pago' },
  ],
  inventario: [
    { key: 'items', label: 'Existencias', action: 'item', actionLabel: 'Agregar artículo' },
    { key: 'movements', label: 'Movimientos', action: 'stock', actionLabel: 'Registrar movimiento' },
  ],
  compras: [
    { key: 'purchases', label: 'Compras e inversión', action: 'purchase', actionLabel: 'Registrar compra' },
    { key: 'suppliers', label: 'Proveedores', action: 'supplier', actionLabel: 'Agregar proveedor' },
  ],
  catalogo: [{ key: 'products', label: 'Productos', action: 'product', actionLabel: 'Agregar producto' }],
  reportes: [
    { key: 'daily', label: 'Ventas diarias' }, { key: 'status', label: 'Fichas' }, { key: 'cash', label: 'Arqueos' },
  ],
  accesos: [
    { key: 'users', label: 'Usuarios', action: 'invite', actionLabel: 'Agregar usuario' },
    { key: 'invites', label: 'Invitaciones', action: 'invite', actionLabel: 'Agregar usuario' },
  ],
}

function SelectRows({ name, list, label = 'Seleccionar', optional = false }: { name: string; list: Row[]; label?: string; optional?: boolean }) {
  return <select name={name} required={!optional} defaultValue=""><option value="">{label}</option>{list.filter((item) => item.active !== false).map((item) => <option key={item.id} value={item.id}>{item.full_name || item.name}{item.unit ? ` · ${item.unit}` : ''}</option>)}</select>
}

function Table({ headings, entries }: { headings: string[]; entries: (string | number | ReactNode)[][] }) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{headings.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{entries.length ? entries.map((cells, index) => <tr key={index}>{cells.map((cell, n) => <td key={n}>{cell}</td>)}</tr>) : <tr><td colSpan={headings.length} className="empty-table">Sin registros todavía.</td></tr>}</tbody></table></div>
}

function ProductImageInput({ imageUrl }: { imageUrl?: string | null }) {
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  return <div className="product-photo-field"><span>Fotografía del producto</span><div className="product-photo-preview">{(preview || imageUrl) ? <img src={preview || imageUrl || ''} alt="Vista previa del producto" /> : <span aria-hidden="true">✦</span>}</div><label className="product-photo-picker">Subir fotografía<input name="image_file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; setPreview(file ? URL.createObjectURL(file) : null) }} /></label><small>JPG, PNG o WebP. Se optimiza al guardar.</small></div>
}

async function compressedPhoto(file: File): Promise<string> {
  if (file.size > 12 * 1024 * 1024) throw new Error('La foto no puede superar 12 MB.')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1100 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  let result = canvas.toDataURL('image/webp', .78)
  if (result.length > 960000) result = canvas.toDataURL('image/webp', .55)
  if (result.length > 960000) throw new Error('La foto es demasiado grande. Prueba con una imagen más pequeña.')
  return result
}

export function AdminPanels({ panel, isSuper }: { panel: string; isSuper: boolean }) {
  const [data, setData] = useState<Data>({})
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<Row | null>(null)
  const [action, setAction] = useState<string | null>(null)
  const [view, setView] = useState('')
  const [query, setQuery] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    setNotice(''); setAction(null); setEditing(null); setQuery(''); setView(sections[panel]?.[0]?.key || '')
  }, [panel])

  useEffect(() => {
    let active = true
    setLoading(true)
    authorizedFetch(`/api/admin?panel=${encodeURIComponent(panel)}`)
      .then(async (response) => { if (!response.ok) throw new Error(`No se pudo cargar ${panel} (HTTP ${response.status}).`); return response.json() })
      .then((result) => { if (active) { setData(result); setLoading(false) } })
      .catch((error) => { if (active) { setNotice(error.message); setLoading(false) } })
    return () => { active = false }
  }, [panel, version])

  function openAction(next: string, row: Row | null = null) {
    setEditing(row); setAction(next); setNotice('')
  }

  function closeAction() { setAction(null); setEditing(null) }

  async function save(event: FormEvent<HTMLFormElement>, name: string) {
    event.preventDefault()
    const form = event.currentTarget
    const body: Record<string, unknown> = { action: name }
    const imageFile = name === 'product' ? new FormData(form).get('image_file') : null
    for (const [key, value] of new FormData(form).entries()) {
      if (key === 'image_file') continue
      if (key.endsWith('_cents')) body[key] = Math.round(Number(value) * 100)
      else if (['id', 'invite_id', 'employee_id', 'inventory_item_id', 'supplier_id', 'quantity', 'quantity_delta', 'minimum_quantity'].includes(key)) body[key] = value === '' ? null : Number(value)
      else if (key === 'active') body[key] = value === 'true'
      else body[key] = value
    }
    try {
      const response = await authorizedFetch('/api/admin', { method: 'POST', body: JSON.stringify(body) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar')
      if (imageFile instanceof File && imageFile.size > 0) {
        try {
          const image = await compressedPhoto(imageFile)
          const upload = await authorizedFetch('/api/product-image', { method: 'POST', body: JSON.stringify({ product_id: result.id, image }) })
          if (!upload.ok) throw new Error((await upload.json()).error || 'No se pudo subir la fotografía')
        } catch (error) {
          setNotice(`Producto guardado, pero la foto no: ${error instanceof Error ? error.message : 'reintenta desde Editar'}`)
          closeAction(); setVersion((current) => current + 1)
          return
        }
      }
      setNotice('Cambios guardados correctamente.')
      if (name === 'invite') setView('invites')
      closeAction()
      setVersion((current) => current + 1)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo guardar') }
  }

  async function deleteProduct(product: Row) {
    if (!window.confirm(`¿Eliminar ${product.name}? Dejará de aparecer en ventas y en el menú público.`)) return
    try {
      const response = await authorizedFetch('/api/admin', { method: 'POST', body: JSON.stringify({ action: 'delete_product', id: Number(product.id) }) })
      if (!response.ok) throw new Error((await response.json()).error || 'No se pudo eliminar')
      setNotice('Producto eliminado del menú y de ventas.')
      closeAction(); setVersion((current) => current + 1)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo eliminar') }
  }

  if (loading) return <div className="panel-loading" role="status">Cargando {panel}…</div>

  const employees = rows(data, 'employees')
  const items = rows(data, 'items')
  const suppliers = rows(data, 'suppliers')
  const filtered = (list: Row[]) => list.filter((row) => Object.values(row).some((value) => String(value ?? '').toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'))))
  const panelSections = sections[panel] || []
  const selected = panelSections.find((section) => section.key === view) || panelSections[0]
  const activeView = selected?.key
  const recentSessions = rows(data, 'sessions')
  const salesByDay = new Map<string, number>()
  for (const session of recentSessions) {
    const day = new Date(String(session.opened_at)).toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' })
    salesByDay.set(day, (salesByDay.get(day) || 0) + Number(session.cash_sales_cents || 0) + Number(session.qr_sales_cents || 0))
  }
  const chartDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(); day.setDate(day.getDate() - 6 + index)
    const key = day.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' })
    return { key, label: day.toLocaleDateString('es-BO', { weekday: 'short', timeZone: 'America/La_Paz' }), value: salesByDay.get(key) || 0 }
  })
  const chartMax = Math.max(...chartDays.map((day) => day.value), 1)
  const openSession = recentSessions.find((session) => !session.closed_at)

  return <div className={`admin-panel panel-${panel}`}>
    {notice && <p className="notice" role="status">{notice}</p>}

    {panel === 'resumen' ? <>
      <div className="metric-grid">
        <div><small>Ventas de hoy</small><strong>{money(data.sales?.sales_cents)}</strong></div>
        <div><small>Fichas emitidas</small><strong>{data.sales?.tickets ?? 0}</strong></div>
        <div><small>Efectivo</small><strong>{money(data.sales?.cash_cents)}</strong></div>
        <div><small>QR</small><strong>{money(data.sales?.qr_cents)}</strong></div>
      </div>
      <div className="overview-grid"><section className="overview-card"><h3>Ventas recientes</h3><p>Importes por día de las cajas registradas.</p><div className="sales-chart">{chartDays.map((day) => <div className="chart-day" key={day.key} title={`${day.key}: ${money(day.value)}`}><div className="chart-track"><div className="chart-bar" style={{ height: `${Math.max(day.value ? 8 : 2, day.value / chartMax * 100)}%` }} /></div><span>{day.label}</span></div>)}</div></section><section className="overview-card"><div className="overview-card-heading"><h3>Estado de caja</h3><span className={openSession ? 'state-open' : 'state-closed'}>{openSession ? 'Abierta' : 'Cerrada'}</span></div>{openSession ? <><div className="overview-line"><span>Fondo inicial</span><strong>{money(openSession.opening_cash_cents)}</strong></div><div className="overview-line"><span>Ventas efectivo</span><strong>{money(openSession.cash_sales_cents)}</strong></div><div className="overview-line"><span>Esperado en caja</span><strong>{money(Number(openSession.opening_cash_cents) + Number(openSession.cash_sales_cents))}</strong></div></> : <p>No hay una caja abierta.</p>}</section></div>
      <div className="metric-grid secondary-metrics"><div><small>Compras de hoy</small><strong>{money(data.purchases?.amount_cents)}</strong></div><div><small>Sueldos pagados hoy</small><strong>{money(data.payroll?.amount_cents)}</strong></div><div><small>Artículos en mínimo</small><strong>{data.lowStock?.count ?? 0}</strong></div></div>
      <h3>Últimos arqueos</h3><Table headings={['Caja', 'Apertura', 'Cierre', 'Fondo', 'Ventas efectivo', 'Ventas QR', 'Contado', 'Diferencia']} entries={recentSessions.map((s) => [s.id, dateTime(s.opened_at), dateTime(s.closed_at), money(s.opening_cash_cents), money(s.cash_sales_cents), money(s.qr_sales_cents), s.closed_at ? money(s.counted_cash_cents) : 'Abierta', s.closed_at ? money(Number(s.counted_cash_cents) - Number(s.opening_cash_cents) - Number(s.cash_sales_cents)) : '—'])} />
    </> : <>
      {!action && <div className="panel-toolbar"><div className="panel-sections" role="tablist" aria-label={`Secciones de ${panel}`}>{panelSections.map((section) => <button type="button" role="tab" aria-selected={activeView === section.key} className={activeView === section.key ? 'active' : ''} key={section.key} onClick={() => { setView(section.key); setQuery('') }}>{section.label}</button>)}</div><div className="toolbar-actions">{panel !== 'reportes' && <input className="list-search" type="search" placeholder="Buscar en la lista" aria-label="Buscar en la lista" value={query} onChange={(event) => setQuery(event.target.value)} />}{selected?.action && <button type="button" className="primary-add" onClick={() => openAction(selected.action!)}><span aria-hidden="true">＋</span>{selected.actionLabel}</button>}</div></div>}

      {action ? <section className="editor-stage"><div className="editor-heading"><div><button type="button" className="back-button" onClick={closeAction}>← Volver a la lista</button><h2>{editing ? 'Editar' : 'Nuevo registro'}</h2><p>Completa los datos y guarda para volver a la lista.</p></div></div>
        {action === 'employee' && <form key={`employee-${editing?.id || 'new'}`} onSubmit={(event) => save(event, 'employee')} className="admin-form editor-form"><h3>{editing ? 'Editar empleado' : 'Agregar empleado'}</h3>{editing && <input type="hidden" name="id" value={editing.id} />}<label>Nombre completo<input name="full_name" required defaultValue={editing?.full_name || ''} /></label><label>Cargo<input name="job_title" defaultValue={editing?.job_title || ''} /></label><label>Tarifa por día (Bs)<input name="daily_rate_cents" type="number" min="0" step="0.01" required defaultValue={editing ? Number(editing.daily_rate_cents) / 100 : ''} /></label><label>Tarifa medio turno (Bs)<input name="half_day_rate_cents" type="number" min="0" step="0.01" required defaultValue={editing ? Number(editing.half_day_rate_cents) / 100 : ''} /></label>{editing && <label>Estado<select name="active" defaultValue={String(editing.active)}><option value="true">Activo</option><option value="false">Inactivo</option></select></label>}<div className="form-actions"><button>Guardar empleado</button><button type="button" className="secondary" onClick={closeAction}>Cancelar</button></div></form>}
        {action === 'shift' && <form onSubmit={(event) => save(event, 'shift')} className="admin-form editor-form"><h3>Programar turno</h3><label>Empleado<SelectRows name="employee_id" list={employees} /></label><label>Fecha<input name="work_date" type="date" required defaultValue={today()} /></label><label>Turno<select name="shift"><option value="dia">Día completo</option><option value="medio_dia">Medio turno</option><option value="noche">Noche</option></select></label><label>Condiciones o nota<input name="note" /></label><div className="form-actions"><button>Programar turno</button><button type="button" className="secondary" onClick={closeAction}>Cancelar</button></div></form>}
        {action === 'attendance' && <form onSubmit={(event) => save(event, 'attendance')} className="admin-form editor-form"><h3>Registrar asistencia</h3><label>Empleado<SelectRows name="employee_id" list={employees} /></label><label>Fecha<input name="work_date" type="date" required defaultValue={today()} /></label><label>Jornada<select name="work_type"><option value="dia">Día completo</option><option value="medio_dia">Medio turno</option></select></label><label>Nota<input name="note" /></label><div className="form-actions"><button>Registrar asistencia</button><button type="button" className="secondary" onClick={closeAction}>Cancelar</button></div></form>}
        {action === 'payment' && <form onSubmit={(event) => save(event, 'payment')} className="admin-form editor-form"><h3>Registrar pago</h3><label>Empleado<SelectRows name="employee_id" list={employees} /></label><label>Importe (Bs)<input name="amount_cents" type="number" step="0.01" min="0.01" required /></label><label>Tipo<select name="payment_type"><option value="sueldo">Sueldo</option><option value="adelanto">Adelanto</option></select></label><label>Medio<select name="payment_method"><option value="efectivo">Efectivo</option><option value="qr">QR</option></select></label><label>Nota<input name="note" /></label><div className="form-actions"><button>Guardar pago</button><button type="button" className="secondary" onClick={closeAction}>Cancelar</button></div></form>}
        {action === 'item' && <form key={`item-${editing?.id || 'new'}`} onSubmit={(event) => save(event, 'item')} className="admin-form editor-form"><h3>{editing ? 'Editar artículo' : 'Agregar artículo'}</h3>{editing && <input type="hidden" name="id" value={editing.id} />}<label>Nombre<input name="name" required defaultValue={editing?.name || ''} /></label><label>Unidad<input name="unit" required placeholder="kg, unidad, litro…" defaultValue={editing?.unit || ''} /></label><label>Mínimo<input name="minimum_quantity" type="number" step="0.001" min="0" required defaultValue={editing?.minimum_quantity || 0} /></label>{editing && <label>Estado<select name="active" defaultValue={String(editing.active)}><option value="true">Activo</option><option value="false">Inactivo</option></select></label>}<div className="form-actions"><button>Guardar artículo</button><button type="button" className="secondary" onClick={closeAction}>Cancelar</button></div></form>}
        {action === 'stock' && <form onSubmit={(event) => save(event, 'stock')} className="admin-form editor-form"><h3>Registrar movimiento</h3><label>Artículo<SelectRows name="inventory_item_id" list={items} /></label><label>Variación<input name="quantity_delta" type="number" step="0.001" required placeholder="+5 o -2" /></label><label>Motivo<select name="reason"><option value="ajuste">Ajuste</option><option value="consumo">Consumo</option><option value="merma">Merma</option></select></label><label>Detalle<input name="note" /></label><div className="form-actions"><button>Guardar movimiento</button><button type="button" className="secondary" onClick={closeAction}>Cancelar</button></div></form>}
        {action === 'supplier' && <form key={`supplier-${editing?.id || 'new'}`} onSubmit={(event) => save(event, 'supplier')} className="admin-form editor-form"><h3>{editing ? 'Editar proveedor' : 'Agregar proveedor'}</h3>{editing && <input type="hidden" name="id" value={editing.id} />}<label>Nombre<input name="name" required defaultValue={editing?.name || ''} /></label><label>Contacto<input name="contact" defaultValue={editing?.contact || ''} /></label><label>Nota<input name="note" defaultValue={editing?.note || ''} /></label>{editing && <label>Estado<select name="active" defaultValue={String(editing.active)}><option value="true">Activo</option><option value="false">Inactivo</option></select></label>}<div className="form-actions"><button>Guardar proveedor</button><button type="button" className="secondary" onClick={closeAction}>Cancelar</button></div></form>}
        {action === 'purchase' && <form onSubmit={(event) => save(event, 'purchase')} className="admin-form editor-form"><h3>Registrar compra o inversión</h3><label>Proveedor<SelectRows name="supplier_id" list={suppliers} optional label="Sin proveedor" /></label><label>Tipo<select name="category"><option value="insumo">Insumo</option><option value="inversion">Inversión / equipo</option><option value="gasto">Gasto</option></select></label><label>Artículo (para insumo)<SelectRows name="inventory_item_id" list={items} optional label="Seleccionar si es insumo" /></label><label>Cantidad (para insumo)<input name="quantity" type="number" step="0.001" min="0" /></label><label>Descripción<input name="description" required /></label><label>Importe (Bs)<input name="amount_cents" type="number" step="0.01" min="0.01" required /></label><label>Pago<select name="payment_status"><option value="pagado">Pagado</option><option value="pendiente">Pendiente</option></select></label><div className="form-actions"><button>Guardar compra</button><button type="button" className="secondary" onClick={closeAction}>Cancelar</button></div></form>}
        {action === 'product' && <form key={`product-${editing?.id || 'new'}`} onSubmit={(event) => save(event, 'product')} className="admin-form editor-form product-editor"><h3>{editing ? 'Editar producto' : 'Agregar producto'}</h3>{editing && <input type="hidden" name="id" value={editing.id} />}<ProductImageInput key={editing?.id || 'new'} imageUrl={editing?.image_url} /><label>Categoría<select name="category" required defaultValue={editing?.category || ''}><option value="" disabled>Seleccionar categoría</option>{categoriesWithProducts(rows(data, 'products')).map((name) => <option key={name} value={name}>{name}</option>)}</select></label><label>Nombre<input name="name" required defaultValue={editing?.name || ''} /></label><label>Presentación<input name="presentation" required defaultValue={editing?.presentation || ''} /></label><label>Precio (Bs)<input name="price_cents" type="number" step="0.01" min="0" required defaultValue={editing ? Number(editing.price_cents) / 100 : ''} /></label>{editing && <label>Estado<select name="active" defaultValue={String(editing.active)}><option value="true">Activo</option><option value="false">Inactivo</option></select></label>}<div className="form-actions"><button>Guardar producto</button><button type="button" className="secondary" onClick={closeAction}>Cancelar</button>{editing && <button type="button" className="delete-product" onClick={() => deleteProduct(editing)}>Eliminar producto</button>}</div></form>}
        {action === 'invite' && <form onSubmit={(event) => save(event, 'invite')} className="admin-form editor-form"><h3>Agregar usuario</h3><p className="form-help">La persona creará su contraseña y verificará su correo antes de ingresar.</p><label>Nombre completo<input name="display_name" required maxLength={120} /></label><label>Correo electrónico<input name="email" type="email" required maxLength={254} /></label><label>Rol<select name="role"><option value="administrador">Administrador · todos los paneles</option><option value="caja">Caja y ventas · solo panel Ventas</option></select></label><div className="form-actions"><button>Crear invitación</button><button type="button" className="secondary" onClick={closeAction}>Cancelar</button></div><p className="form-help">La invitación dura 7 días. Comparte el <a href="/?vista=operacion&registro=1" target="_blank" rel="noreferrer">enlace de registro</a> con la persona.</p></form>}
        {action === 'access' && editing && <form onSubmit={(event) => save(event, 'access')} className="admin-form editor-form"><h3>Gestionar acceso</h3><p className="form-help">{editing.name} · {editing.email}</p><input type="hidden" name="user_id" value={editing.id} /><label>Rol<select name="role" defaultValue={editing.role || 'caja'}><option value="administrador">Administrador</option><option value="caja">Caja y ventas</option><option value="cocina">Cocina</option></select></label><label>Estado<select name="active" defaultValue={String(editing.active !== false)}><option value="true">Activo</option><option value="false">Suspendido</option></select></label><div className="form-actions"><button disabled={!editing.emailVerified}>Guardar acceso</button><button type="button" className="secondary" onClick={closeAction}>Cancelar</button></div></form>}
      </section> : <div className="records-stage">
        {panel === 'personal' && activeView === 'employees' && <Table headings={['Nombre', 'Cargo', 'Día', 'Medio turno', 'Devengado', 'Pagado', 'Saldo', 'Estado', '']} entries={filtered(employees).map((e) => [e.full_name, e.job_title, money(e.daily_rate_cents), money(e.half_day_rate_cents), money(e.earned_cents), money(e.paid_cents), money(Number(e.earned_cents) - Number(e.paid_cents)), e.active ? 'Activo' : 'Inactivo', <button className="table-action" onClick={() => openAction('employee', e)}>Editar</button>])} />}
        {panel === 'personal' && activeView === 'shifts' && <Table headings={['Fecha', 'Empleado', 'Turno', 'Condiciones']} entries={filtered(rows(data, 'shifts')).map((s) => [date(s.work_date), s.full_name, s.shift, s.note])} />}
        {panel === 'personal' && activeView === 'attendance' && <Table headings={['Fecha', 'Empleado', 'Jornada', 'Devengado', 'Nota']} entries={filtered(rows(data, 'attendance')).map((a) => [date(a.work_date), a.full_name, a.work_type, money(a.earned_cents), a.note])} />}
        {panel === 'personal' && activeView === 'payments' && <Table headings={['Fecha', 'Empleado', 'Tipo', 'Medio', 'Importe', 'Nota']} entries={filtered(rows(data, 'payments')).map((p) => [dateTime(p.paid_at), p.full_name, p.payment_type, p.payment_method, money(p.amount_cents), p.note])} />}
        {panel === 'inventario' && activeView === 'items' && <Table headings={['Artículo', 'Unidad', 'Cantidad', 'Mínimo', 'Estado', '']} entries={filtered(items).map((i) => [i.name, i.unit, i.quantity, i.minimum_quantity, !i.active ? 'Inactivo' : Number(i.quantity) <= Number(i.minimum_quantity) ? 'Bajo mínimo' : 'Normal', <button className="table-action" onClick={() => openAction('item', i)}>Editar</button>])} />}
        {panel === 'inventario' && activeView === 'movements' && <Table headings={['Fecha', 'Artículo', 'Variación', 'Motivo', 'Detalle']} entries={filtered(rows(data, 'movements')).map((m) => [dateTime(m.created_at), m.name, `${m.quantity_delta} ${m.unit}`, m.reason, m.note])} />}
        {panel === 'compras' && activeView === 'purchases' && <Table headings={['Fecha', 'Tipo', 'Proveedor', 'Descripción', 'Cantidad', 'Importe', 'Pago']} entries={filtered(rows(data, 'purchases')).map((p) => [dateTime(p.purchased_at), p.category, p.supplier_name || '—', p.description, p.item_name ? `${p.quantity} · ${p.item_name}` : '—', money(p.amount_cents), p.payment_status])} />}
        {panel === 'compras' && activeView === 'suppliers' && <Table headings={['Nombre', 'Contacto', 'Nota', 'Estado', '']} entries={filtered(suppliers).map((s) => [s.name, s.contact, s.note, s.active ? 'Activo' : 'Inactivo', <button className="table-action" onClick={() => openAction('supplier', s)}>Editar</button>])} />}
        {panel === 'catalogo' && <div className="menu-admin-grid">{filtered(rows(data, 'products')).map((p) => <article className={`menu-admin-card ${p.active ? '' : 'is-inactive'}`} key={p.id}><div className="menu-admin-image">{p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : <span aria-hidden="true">✦</span>}</div><div className="menu-admin-info"><span>{p.category} · {p.active ? 'Activo' : 'Inactivo'}</span><h3>{p.name}</h3><p>{p.presentation}</p><div><strong>{money(p.price_cents)}</strong><button className="table-action" onClick={() => openAction('product', p)}>Editar</button></div></div></article>)}{filtered(rows(data, 'products')).length === 0 && <p className="menu-admin-empty">No hay productos para mostrar.</p>}</div>}
        {panel === 'reportes' && <><div className="metric-grid secondary-metrics"><div><small>Jornadas devengadas</small><strong>{money(data.payroll?.earned_cents)}</strong></div>{rows(data, 'purchases').map((p) => <div key={`${p.category}-${p.payment_status}`}><small>{p.category} · {p.payment_status}</small><strong>{money(p.amount_cents)}</strong></div>)}</div>{activeView === 'daily' && <Table headings={['Fecha', 'Fichas', 'Total', 'Efectivo', 'QR']} entries={rows(data, 'daily').map((d) => [date(d.service_date), d.tickets, money(d.sales_cents), money(d.cash_cents), money(d.qr_cents)])} />}{activeView === 'status' && <Table headings={['Estado', 'Cantidad']} entries={rows(data, 'status').map((s) => [s.status, s.count])} />}{activeView === 'cash' && <Table headings={['Caja', 'Apertura', 'Cierre', 'Fondo', 'Efectivo', 'QR', 'Contado', 'Diferencia']} entries={rows(data, 'cash').map((s) => [s.id, dateTime(s.opened_at), dateTime(s.closed_at), money(s.opening_cash_cents), money(s.cash_sales_cents), money(s.qr_sales_cents), s.closed_at ? money(s.counted_cash_cents) : 'Abierta', s.closed_at ? money(Number(s.counted_cash_cents) - Number(s.opening_cash_cents) - Number(s.cash_sales_cents)) : '—'])} />}</>}
        {panel === 'accesos' && isSuper && activeView === 'users' && <Table headings={['Cuenta', 'Correo', 'Verificado', 'Rol', 'Estado', '']} entries={filtered(rows(data, 'users')).map((u) => [u.name, u.email, u.emailVerified ? 'Sí' : 'No', u.role === 'caja' ? 'Caja y ventas' : u.role || 'Sin acceso', u.active === true ? 'Activo' : '—', u.role === 'superadministrador' ? 'Protegido' : <button className="table-action" onClick={() => openAction('access', u)}>Gestionar</button>])} />}
        {panel === 'accesos' && isSuper && activeView === 'invites' && <Table headings={['Nombre', 'Correo', 'Rol', 'Estado', 'Vence', 'Acción']} entries={filtered(rows(data, 'invites')).map((invite) => [invite.display_name, invite.email, invite.role === 'caja' ? 'Caja y ventas' : 'Administrador', invite.status === 'pendiente' && new Date(invite.expires_at) < new Date() ? 'Vencida' : invite.status, dateTime(invite.expires_at), invite.status === 'pendiente' ? <form onSubmit={(event) => save(event, 'revoke_invite')}><input type="hidden" name="invite_id" value={invite.id} /><button className="table-action">Revocar</button></form> : '—'])} />}
      </div>}
    </>}
  </div>
}
