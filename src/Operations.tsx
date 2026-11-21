import { useEffect, useLayoutEffect, useState } from 'react'
import { authorizedFetch, neonAuth } from './auth'
import { AdminPanels, adminTabs } from './AdminPanels'
import { BrandLogo } from './BrandLogo'
import { PanelIcon, type IconName } from './PanelIcon'
import { categoriesWithProducts } from './menuCategories'
import './modern.css'
import './identity.css'
import './sales.css'
import './order-flow.css'
import './theme-dark.css'
import './sales-compact.css'

type Product = { id: string; category: string; name: string; presentation: string; price_cents: number; image_url: string | null }
type Staff = { display_name: string; role: 'superadministrador' | 'administrador' | 'caja' | 'cocina' }
type Cash = { id: string; opening_cash_cents: number; cash_sales_cents: number; qr_sales_cents: number }
type Order = { id: string; service_date: string; ticket_number: number; table_number: number | null; total_cents: number; payment_method: string | null; paid_at: string | null; created_at: string; status: string; cashier_name?: string | null; amount_received_cents?: number | null; change_cents?: number | null; items: { name: string; presentation: string; quantity: number; unit_price_cents: number; line_total_cents: number }[] }
const money = (cents: number) => `Bs ${(cents / 100).toFixed(2)}`
function OrderDocument({ order, kind, onClose }: { order: Order; kind: 'ficha' | 'recibo'; onClose: () => void }) {
  const timestamp = kind === 'recibo' ? order.paid_at : order.created_at
  const paidAt = timestamp ? new Date(timestamp) : null
  return <div className="document-overlay" role="dialog" aria-modal="true" aria-label={kind === 'ficha' ? 'Ficha de pedido' : 'Recibo de pago'}>
    <div className="document-preview">
      <div className="document-actions"><button type="button" className="secondary-utility" onClick={onClose}>Cerrar</button><button type="button" onClick={() => window.print()}>Imprimir {kind}</button></div>
      {kind === 'ficha' ? <div className="order-document">
        <div className="document-brand">NOVILLO GRILL</div>
        <div className="document-subtitle">FICHA DE PEDIDO</div>
        <strong className="document-number">Nº {order.ticket_number}</strong>
        {order.table_number && <strong className="document-table">MESA {order.table_number}</strong>}
        <p>{timestamp ? new Date(timestamp).toLocaleString('es-BO', { timeZone: 'America/La_Paz' }) : ''}</p>
        <div className="document-lines">{order.items.map((item, index) => <div key={`${item.name}-${index}`}><span>{item.quantity} × {item.name}<small>{item.presentation}</small></span><strong>{money(item.line_total_cents)}</strong></div>)}</div>
        <div className="document-total"><span>Total del pedido</span><strong>{money(order.total_cents)}</strong></div>
        <p>{order.status === 'anulado' ? 'Pedido cancelado.' : 'Pago pendiente · Conserva este número para solicitar la cuenta.'}</p>
      </div> : <div className="order-document receipt-document">
        <header className="receipt-header"><BrandLogo /><strong>RECIBO DE PAGO</strong><span>Av. Villazón, entre Padilla y<br />Beneméritos de la Patria · Sacaba</span></header>
        <div className="receipt-rule" />
        <div className="receipt-meta"><span>Recibo Nº</span><strong>{String(order.id).padStart(6, '0')}</strong><span>Pedido Nº</span><strong>{order.ticket_number}</strong><span>Fecha</span><strong>{paidAt?.toLocaleDateString('es-BO', { timeZone: 'America/La_Paz' }) || '—'}</strong><span>Hora</span><strong>{paidAt?.toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit' }) || '—'}</strong><span>Cajero</span><strong>{order.cashier_name || '—'}</strong>{order.table_number && <><span>Mesa</span><strong>{order.table_number}</strong></>}</div>
        <div className="receipt-rule" />
        <div className="receipt-items-heading"><span>DESCRIPCIÓN</span><span>IMPORTE</span></div>
        <div className="receipt-items">{order.items.map((item, index) => <div className="receipt-item" key={`${item.name}-${index}`}><div><strong>{item.name}</strong>{item.presentation && <small>{item.presentation}</small>}<small>{item.quantity} × {money(item.unit_price_cents)}</small></div><strong>{money(item.line_total_cents)}</strong></div>)}</div>
        <div className="receipt-rule" />
        <div className="receipt-summary"><span>Subtotal</span><strong>{money(order.total_cents)}</strong><span className="receipt-grand-label">TOTAL</span><strong className="receipt-grand-value">{money(order.total_cents)}</strong></div>
        <div className="receipt-rule" />
        <div className="receipt-meta receipt-payment"><span>Método de pago</span><strong>{order.payment_method === 'qr' ? 'QR' : 'Efectivo'}</strong><span>Monto pagado</span><strong>{money(order.total_cents)}</strong>{order.payment_method === 'efectivo' && order.amount_received_cents != null && <><span>Efectivo recibido</span><strong>{money(order.amount_received_cents)}</strong><span>Cambio</span><strong>{money(order.change_cents ?? 0)}</strong></>}<span>Tipo de pedido</span><strong>Consumo en mesa</strong></div>
        <footer className="receipt-footer"><strong>¡Gracias por visitarnos!</strong><span>Novillo Grill · Sacaba</span></footer>
      </div>}
    </div>
  </div>
}
const panelIcons: Record<string, IconName> = { personal: 'staff', inventario: 'inventory', compras: 'purchases', catalogo: 'menu', reportes: 'reports', accesos: 'access' }

export function Operations() {
  if (!neonAuth) return <p role="alert">Falta configurar VITE_NEON_AUTH_URL.</p>
  return <OperationsWithAuth />
}

function OperationsWithAuth() {
  const session = neonAuth!.useSession()
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'verify'>(new URLSearchParams(location.search).has('registro') ? 'sign-up' : 'sign-in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [message, setMessage] = useState('')
  const [staff, setStaff] = useState<Staff | null>(null)
  const [cash, setCash] = useState<Cash | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [cart, setCart] = useState<Record<string, number>>({})
  const [tableNumber, setTableNumber] = useState<number | null>(null)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [opening, setOpening] = useState('0')
  const [counted, setCounted] = useState('0')
  const [method, setMethod] = useState<'efectivo' | 'qr'>('efectivo')
  const [receivedCash, setReceivedCash] = useState('')
  const [panel, setPanel] = useState('operacion')
  const [operationView, setOperationView] = useState<'venta' | 'fichas'>('venta')
  const [showCashDialog, setShowCashDialog] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Todos')
  const [busy, setBusy] = useState(false)
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null)
  const [documentOrder, setDocumentOrder] = useState<{ order: Order; kind: 'ficha' | 'recibo' } | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('novillo-theme') === 'dark' ? 'dark' : 'light')

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('novillo-theme', theme)
  }, [theme])
  useEffect(() => {
    if (!showCashDialog) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setShowCashDialog(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showCashDialog])
  const authThemeButton = <button type="button" className="auth-theme-toggle" aria-label={theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'} title={theme === 'light' ? 'Modo oscuro' : 'Modo claro'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}><PanelIcon name={theme === 'light' ? 'moon' : 'sun'} /></button>

  async function refresh() {
    const meRes = await authorizedFetch('/api/me')
    if (!meRes.ok) { setStaff(null); setMessage(meRes.status === 403 ? 'Tu cuenta no tiene una invitación activa o el acceso está suspendido.' : `No se pudo validar el acceso (HTTP ${meRes.status}).`); return }
    setStaff((await meRes.json()).staff)
    const [cashRes, ordersRes, menuRes] = await Promise.allSettled([
      authorizedFetch('/api/cash'), authorizedFetch('/api/orders'), fetch('/api/menu'),
    ])
    if (cashRes.status === 'fulfilled' && cashRes.value.ok) setCash((await cashRes.value.json()).session)
    if (ordersRes.status === 'fulfilled' && ordersRes.value.ok) setOrders((await ordersRes.value.json()).orders)
    if (menuRes.status === 'fulfilled' && menuRes.value.ok) setProducts((await menuRes.value.json()).products)
  }

  useEffect(() => {
    if (!session.data?.user) { setStaff(null); return }
    refresh().catch((error) => setMessage(error instanceof Error ? error.message : 'No se pudo validar la sesión.'))
  }, [session.data?.user?.id])

  useEffect(() => {
    if (!session.data?.user || panel !== 'operacion') return
    fetch('/api/menu').then(async (response) => { if (response.ok) setProducts((await response.json()).products) }).catch(() => {})
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      authorizedFetch('/api/orders').then(async (response) => {
        if (response.ok) setOrders((await response.json()).orders)
      }).catch(() => {})
    }, 10000)
    return () => window.clearInterval(timer)
  }, [session.data?.user?.id, panel])

  const cartItems = products.filter((p) => cart[p.id] > 0)
  const categories = ['Todos', ...categoriesWithProducts(products)]
  const visibleProducts = products.filter((p) => (category === 'Todos' || p.category === category) && `${p.name} ${p.presentation} ${p.category}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')))
  const total = cartItems.reduce((sum, p) => sum + p.price_cents * cart[p.id], 0)
  const currentEditingOrder = editingOrder ? orders.find((order) => order.id === editingOrder.id) ?? editingOrder : null
  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      if (mode === 'verify') {
        const result = await neonAuth!.emailOtp.verifyEmail({ email, otp })
        if (result.error) setMessage(result.error.message ?? 'Código inválido')
        else { setMode('sign-in'); setPassword(''); setMessage('Correo verificado. Ya puedes ingresar.') }
        return
      }
      const result = mode === 'sign-in'
        ? await neonAuth!.signIn.email({ email, password })
        : await neonAuth!.signUp.email({ name, email, password })
      if (result.error) setMessage(result.error.message ?? 'No se pudo ingresar')
      else if (mode === 'sign-up') { setMode('verify'); setMessage('Revisa tu correo e ingresa el código de verificación.') }
      else setMessage('')
    } catch { setMessage('No se pudo conectar con Neon Auth.') }
    finally { setBusy(false) }
  }

  async function openCash(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      const cents = Math.round(Number(opening) * 100)
      const res = await authorizedFetch('/api/cash', { method: 'POST', body: JSON.stringify({ opening_cash_cents: cents }) })
      if (!res.ok) throw new Error((await res.json()).error)
      setShowCashDialog(false)
      await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo abrir caja') }
    finally { setBusy(false) }
  }

  function startAddition(order: Order) {
    setEditingOrder(order)
    setCart({})
    setTableNumber(order.table_number)
    setSearch('')
    setCategory('Todos')
    setPaymentOrderId(null)
    setMessage('')
    setOperationView('venta')
  }

  function abandonAddition() {
    setEditingOrder(null)
    setCart({})
    setTableNumber(null)
    setOperationView('fichas')
  }

  async function createOrder() {
    if (!cash || cartItems.length === 0 || (!editingOrder && tableNumber === null)) return
    setBusy(true); setMessage('')
    try {
      const res = await authorizedFetch(editingOrder ? '/api/order-items' : '/api/orders', { method: 'POST', body: JSON.stringify({
        ...(editingOrder ? { order_id: Number(editingOrder.id) } : { table_number: tableNumber }),
        cash_session_id: Number(cash.id),
        items: cartItems.map((p) => ({ product_id: Number(p.id), quantity: cart[p.id] })),
      }) })
      if (!res.ok) throw new Error((await res.json()).error)
      const data: { order: Order } = await res.json()
      setCart({})
      setTableNumber(null)
      setEditingOrder(null)
      setMessage(editingOrder ? `Productos añadidos al pedido Nº ${data.order.ticket_number}.` : `Ficha Nº ${data.order.ticket_number} emitida. Cobro pendiente.`)
      setDocumentOrder({ kind: 'ficha', order: data.order })
      setOperationView('fichas')
      await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo registrar el pedido') }
    finally { setBusy(false) }
  }

  async function collectOrder(order: Order) {
    if (!cash || order.paid_at) return
    const receivedCents = method === 'qr' ? order.total_cents : Math.round(Number(receivedCash) * 100)
    if (!Number.isSafeInteger(receivedCents) || receivedCents < order.total_cents) { setMessage('El efectivo recibido debe cubrir el total del pedido.'); return }
    setBusy(true); setMessage('')
    try {
      const res = await authorizedFetch('/api/order-payment', { method: 'POST', body: JSON.stringify({ order_id: Number(order.id), cash_session_id: Number(cash.id), payment_method: method, expected_total_cents: order.total_cents, amount_received_cents: receivedCents }) })
      if (!res.ok) throw new Error((await res.json()).error)
      const data = await res.json()
      const paidOrder = data.order as Order
      setPaymentOrderId(null)
      setReceivedCash('')
      setDocumentOrder({ kind: 'recibo', order: paidOrder })
      setMessage(`Cobro registrado. Recibo Nº ${paidOrder.id} listo.`)
      await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo registrar el cobro'); await refresh() }
    finally { setBusy(false) }
  }

  async function closeCash(event: React.FormEvent) {
    event.preventDefault()
    if (!cash) return
    setBusy(true); setMessage('')
    try {
      const cents = Math.round(Number(counted) * 100)
      const res = await authorizedFetch('/api/cash-close', { method: 'POST', body: JSON.stringify({ session_id: Number(cash.id), counted_cash_cents: cents }) })
      if (!res.ok) throw new Error((await res.json()).error)
      setMessage('Caja cerrada correctamente.')
      setShowCashDialog(false)
      await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo cerrar la caja') }
    finally { setBusy(false) }
  }

  async function cancelOrder(order: Order) {
    if (order.paid_at || order.status === 'anulado' || !window.confirm(`¿Cancelar el pedido Nº ${order.ticket_number}${order.table_number ? ` de la mesa ${order.table_number}` : ''}? Esta acción no se puede deshacer.`)) return
    setBusy(true); setMessage('')
    try {
      const response = await authorizedFetch('/api/order-cancel', { method: 'POST', body: JSON.stringify({ order_id: Number(order.id) }) })
      if (!response.ok) throw new Error((await response.json()).error)
      setPaymentOrderId(null)
      setMessage(`Pedido Nº ${order.ticket_number} cancelado.`)
      await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo cancelar el pedido') }
    finally { setBusy(false) }
  }

  if (session.isPending) return <section className="auth-screen">{authThemeButton}<div className="auth-card"><p>Comprobando sesión…</p></div></section>
  if (!session.data?.user) return <section className="auth-screen">{authThemeButton}<div className="auth-card"><div className="auth-brand"><BrandLogo /><span>NOVILLO GRILL</span></div><span className="section-kicker">SISTEMA DE GESTIÓN</span><h2>Bienvenido de nuevo</h2><p className="auth-intro">Ingresa para continuar con la operación del restaurante.</p>
    <form onSubmit={login} className="auth-form">
      {mode === 'sign-up' && <label>Nombre<input required value={name} onChange={(e) => setName(e.target.value)} /></label>}
      <label>Correo<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      {mode === 'verify'
        ? <label>Código de verificación<input required inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value)} /></label>
        : <label>Contraseña<input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></label>}
      <button disabled={busy}>{mode === 'sign-in' ? 'Ingresar' : mode === 'sign-up' ? 'Crear cuenta' : 'Verificar correo'}</button>
    </form>
    {mode === 'verify' && <button className="text-button" disabled={!email} onClick={async () => { const result = await neonAuth!.emailOtp.sendVerificationOtp({ email, type: 'email-verification' }); setMessage(result.error ? (result.error.message ?? 'No se pudo reenviar') : 'Código enviado otra vez.') }}>Reenviar código</button>}
    <button className="text-button" onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setMessage('') }}>{mode === 'sign-in' ? 'Crear cuenta' : 'Ya tengo cuenta'}</button>
    {mode === 'sign-in' && <button className="text-button" onClick={() => { setMode('verify'); setMessage('Solicita un código si no lo recibiste.') }}>Verificar mi correo</button>}
    {message && <p role="alert">{message}</p>}
  </div></section>

  if (session.data.user.emailVerified === false) return <section className="auth-screen">{authThemeButton}<div className="auth-card"><h2>Verifica tu correo</h2><p>La cuenta necesita un código enviado a {session.data.user.email}.</p>
    <form className="auth-form" onSubmit={async (event) => { event.preventDefault(); setBusy(true); const result = await neonAuth!.emailOtp.verifyEmail({ email: session.data!.user.email, otp }); setMessage(result.error ? (result.error.message ?? 'Código inválido') : 'Correo verificado. Actualizando sesión…'); setBusy(false); if (!result.error) location.reload() }}>
      <label>Código de verificación<input required inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value)} /></label><button disabled={busy}>Verificar correo</button>
    </form><button className="text-button" onClick={async () => { const result = await neonAuth!.emailOtp.sendVerificationOtp({ email: session.data!.user.email, type: 'email-verification' }); setMessage(result.error ? (result.error.message ?? 'No se pudo enviar') : 'Código enviado.') }}>Enviar código</button>{message && <p role="status">{message}</p>}
  </div></section>

  if (!staff) return <section className="auth-screen">{authThemeButton}<div className="auth-card"><h2>Acceso pendiente</h2><p>{message || 'Comprobando tu autorización…'}</p><button onClick={() => refresh().catch((error) => setMessage(error instanceof Error ? error.message : 'No se pudo validar la sesión.'))}>Reintentar</button> <button onClick={() => neonAuth!.signOut()}>Salir</button></div></section>

  const isAdmin = staff.role === 'superadministrador' || staff.role === 'administrador'
  const navigation = <nav className="panel-nav" aria-label="Paneles del sistema">
    {isAdmin && <span className="nav-caption">GENERAL</span>}
    {isAdmin && <button className={panel === 'resumen' ? 'selected' : ''} onClick={() => setPanel('resumen')}><span className="nav-icon"><PanelIcon name="overview" /></span>Resumen</button>}
    <button className={panel === 'operacion' ? 'selected' : ''} onClick={() => setPanel('operacion')}><span className="nav-icon"><PanelIcon name="sales" /></span>{staff.role === 'cocina' ? 'Cocina' : 'Ventas'}</button>
    {isAdmin && <span className="nav-caption nav-caption-second">ADMINISTRACIÓN</span>}
    {isAdmin && adminTabs.filter(([key]) => key !== 'resumen' && (key !== 'accesos' || staff.role === 'superadministrador')).map(([key, label]) =>
      <button key={key} className={panel === key ? 'selected' : ''} onClick={() => setPanel(key)}><span className="nav-icon"><PanelIcon name={panelIcons[key]} /></span>{label}</button>)}
  </nav>

  const shell = (content: React.ReactNode, title: string) => <div className={`app-shell${panel === 'operacion' ? ' sales-shell' : ''}`}>
    <aside className="app-sidebar"><a className="side-brand" href="/"><BrandLogo /><span>NOVILLO GRILL</span></a>{navigation}<div className="side-profile"><span className="profile-avatar">{staff.display_name.slice(0, 2).toUpperCase()}</span><span><strong>{staff.display_name}</strong><small>{staff.role === 'superadministrador' ? 'Superadministrador' : staff.role === 'caja' ? 'Caja y ventas' : staff.role}</small></span></div></aside>
    <div className="app-main"><header className="app-topbar"><h1 className="topbar-title">{title}</h1>
      {panel === 'operacion' && staff.role !== 'cocina' && <div className="sales-view-switch" role="tablist" aria-label="Vistas de ventas"><button type="button" role="tab" aria-selected={operationView === 'venta'} className={operationView === 'venta' ? 'active' : ''} onClick={() => setOperationView('venta')}>{editingOrder ? `Ampliar Nº ${editingOrder.ticket_number}` : 'Nuevo pedido'}</button><button type="button" role="tab" aria-selected={operationView === 'fichas'} className={operationView === 'fichas' ? 'active' : ''} onClick={() => setOperationView('fichas')}>Pedidos <span className="sales-tab-count">{orders.length}</span></button></div>}
      <div className="topbar-right">{panel === 'operacion' && staff.role !== 'cocina' && <button type="button" className={`cash-control${cash ? ' is-open' : ''}`} onClick={() => { setMessage(''); setShowCashDialog(true) }} aria-label={cash ? `Gestionar caja abierta Nº ${cash.id}` : 'Abrir caja'}><span className="cash-control-dot" aria-hidden="true" />{cash ? `Caja Nº ${cash.id}` : 'Abrir caja'}</button>}<button className="theme-toggle" aria-label={theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'} title={theme === 'light' ? 'Modo oscuro' : 'Modo claro'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}><PanelIcon name={theme === 'light' ? 'moon' : 'sun'} /></button><button className="logout-button" onClick={() => neonAuth!.signOut()}><PanelIcon name="logout" /> <span>Salir</span></button></div>
    </header><main className="work-panel">{content}</main></div>
  </div>

  if (panel !== 'operacion' && isAdmin) return shell(<AdminPanels panel={panel} isSuper={staff.role === 'superadministrador'} />, adminTabs.find(([key]) => key === panel)?.[1] || 'Gestión')

  return shell(<>
    {message && <p role="status" className="notice">{message}</p>}
    {staff.role !== 'cocina' && operationView === 'venta' && <div className="order-layout sales-layout">
      <div className="catalog-panel sales-catalog"><div className="sales-panel-heading"><div><span className="sales-eyebrow">CATÁLOGO</span><h3>Menú</h3></div></div><input className="product-search" type="search" placeholder="Buscar plato o bebida" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar productos" /><div className="category-filter">{categories.map((c) => <button key={c} className={category === c ? 'selected' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div><div className="product-list sales-product-grid">{visibleProducts.map((p) => <button type="button" key={p.id} className="sales-product-card" onClick={() => setCart((current) => ({ ...current, [p.id]: (current[p.id] ?? 0) + 1 }))}><span className="sales-product-image">{p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : <span className="sales-image-mark" aria-hidden="true">N</span>}{cart[p.id] > 0 && <span className="sales-product-count">{cart[p.id]}</span>}</span><span className="sales-product-details"><span className="sales-product-category">{p.category}</span><span className="product-name">{p.name}</span><small className="sales-product-presentation">{p.presentation}</small><span className="sales-product-bottom"><strong>{money(p.price_cents)}</strong><span aria-hidden="true">＋</span></span></span></button>)}{visibleProducts.length === 0 && <p className="sales-empty">Aún no hay productos en esta categoría o búsqueda.</p>}</div></div>
      <div className="cart sales-cart">
        <div className="sales-cart-heading"><div><span className="sales-eyebrow">{editingOrder ? 'AMPLIAR PEDIDO' : 'NUEVO PEDIDO'}</span><h3>{editingOrder ? `Pedido Nº ${editingOrder.ticket_number}` : 'Pedido'}</h3></div><span>{cartItems.reduce((sum, p) => sum + cart[p.id], 0)} artículos</span></div>
        {editingOrder && <div className="sales-edit-context"><span>Mesa {editingOrder.table_number ?? 'sin asignar'} · Productos adicionales</span><button type="button" onClick={abandonAddition}>Volver</button></div>}
        <div className="sales-cart-items">{cartItems.length === 0 && <div className="sales-cart-empty"><strong>{editingOrder ? 'Añade productos' : 'Aún no hay platos'}</strong><p>Selecciona productos del menú.</p></div>}{cartItems.map((p) => <div className="cart-row" key={p.id}><span>{p.name}<small>{p.presentation} · {cart[p.id]} × {money(p.price_cents)}</small></span><button aria-label={`Quitar un ${p.name}`} onClick={() => setCart((current) => ({ ...current, [p.id]: current[p.id] - 1 }))}>−</button><strong>{money(p.price_cents * cart[p.id])}</strong></div>)}</div>
        <div className="sales-checkout">
          {!editingOrder && <fieldset className="sales-table-picker"><legend>Mesa <span>Selecciona una</span></legend><div className="sales-table-grid">{Array.from({ length: 12 }, (_, index) => index + 1).map((number) => <button key={number} type="button" className={tableNumber === number ? 'selected' : ''} aria-pressed={tableNumber === number} aria-label={`Mesa ${number}`} onClick={() => setTableNumber(number)}>{number}</button>)}</div></fieldset>}
          {currentEditingOrder && <div className="sales-addition-totals"><span>Pedido actual <strong>{money(currentEditingOrder.total_cents)}</strong></span><span>Productos añadidos <strong>{money(total)}</strong></span></div>}
          <div className="cart-total"><span>{editingOrder ? 'Nuevo total' : 'Total del pedido'}</span><strong>{money((currentEditingOrder?.total_cents ?? 0) + total)}</strong></div>
          <button disabled={busy || (Boolean(cash) && (cartItems.length === 0 || (!editingOrder && tableNumber === null)))} onClick={cash ? createOrder : () => { setMessage(''); setShowCashDialog(true) }}>{cash ? editingOrder ? 'Agregar al pedido' : 'Registrar pedido' : 'Abrir caja para registrar pedidos'} <span aria-hidden="true">↗</span></button>
        </div>
      </div>
    </div>}
    {(staff.role === 'cocina' || operationView === 'fichas') && <section className="tickets-view">
      <div className="list-heading"><h3>Pedidos y cuentas</h3><span>{orders.filter((order) => !order.paid_at && order.status !== 'anulado').length} por cobrar · {orders.length} registros</span></div>
      <div className="ticket-list">{orders.length === 0 && <p className="empty-tickets">Todavía no hay pedidos para este turno.</p>}
        {orders.map((order) => <article className="order-record" key={order.id}>
          <div className="order-record-main"><strong>Nº {order.ticket_number}</strong><span>{order.table_number ? `Mesa ${order.table_number} · ` : ''}{order.items.map((item) => `${item.quantity} ${item.name}`).join(', ')}</span><b>{money(order.total_cents)}</b></div>
          <div className="order-record-meta"><span className={`payment-badge ${order.status === 'anulado' ? 'canceled' : order.paid_at ? 'paid' : 'pending'}`}>{order.status === 'anulado' ? 'Cancelado' : order.paid_at ? `Pagado · ${order.payment_method === 'qr' ? 'QR' : 'efectivo'}` : 'Pendiente de cobro'}</span><span>{new Date(order.service_date).toLocaleDateString('es-BO', { timeZone: 'UTC' })}{order.table_number ? ` · Mesa ${order.table_number}` : ''}</span></div>
          <div className="order-record-actions"><button type="button" className="secondary-utility" onClick={() => setDocumentOrder({ order, kind: order.paid_at ? 'recibo' : 'ficha' })}>Ver {order.paid_at ? 'recibo' : 'ficha'}</button>
            {staff.role !== 'cocina' && cash && !order.paid_at && order.status !== 'anulado' && <button type="button" className="secondary-utility add-items-button" onClick={() => startAddition(order)}>Agregar productos</button>}
            {staff.role !== 'cocina' && cash && !order.paid_at && order.status !== 'anulado' && <button type="button" onClick={() => { setPaymentOrderId(paymentOrderId === order.id ? null : order.id); setReceivedCash((order.total_cents / 100).toFixed(2)); setMethod('efectivo') }}>Cobrar pedido</button>}
            {staff.role !== 'cocina' && !order.paid_at && order.status !== 'anulado' && <button type="button" className="secondary-utility cancel-order-button" disabled={busy} onClick={() => cancelOrder(order)}>Cancelar pedido</button>}
          </div>
          {paymentOrderId === order.id && <div className="order-collection"><div><strong>Cuenta Nº {order.ticket_number}</strong><span>{money(order.total_cents)}</span></div><label>Medio de pago<select value={method} onChange={(event) => setMethod(event.target.value as 'efectivo' | 'qr')}><option value="efectivo">Efectivo</option><option value="qr">QR</option></select></label>{method === 'efectivo' && <label>Efectivo recibido (Bs)<input type="number" min={(order.total_cents / 100).toFixed(2)} step="0.01" inputMode="decimal" value={receivedCash} onChange={(event) => setReceivedCash(event.target.value)} /><small>Cambio: {money(Math.max(0, Math.round(Number(receivedCash) * 100) - order.total_cents))}</small></label>}<button type="button" disabled={busy || (method === 'efectivo' && (!receivedCash || Math.round(Number(receivedCash) * 100) < order.total_cents))} onClick={() => collectOrder(order)}>Confirmar cobro y generar recibo</button></div>}
        </article>)}
      </div>
    </section>}
    {staff.role !== 'cocina' && showCashDialog && <div className="cash-dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setShowCashDialog(false) }}><section className="cash-dialog" role="dialog" aria-modal="true" aria-label={cash ? 'Gestionar caja' : 'Abrir caja'}><button type="button" className="cash-dialog-close" aria-label="Cerrar" onClick={() => setShowCashDialog(false)}>×</button><span className="cash-dialog-kicker">CAJA</span><h2>{cash ? `Turno Nº ${cash.id}` : 'Abrir caja'}</h2>{cash ? <><p>La caja está abierta. Al terminar el turno, registra el efectivo contado para generar el arqueo.</p><form onSubmit={closeCash}><label>Efectivo contado en Bs<input required type="number" min="0" step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus /></label><div className="cash-dialog-total"><span>Efectivo esperado</span><strong>{money(cash.opening_cash_cents + cash.cash_sales_cents)}</strong></div><button disabled={busy}>Cerrar caja y guardar arqueo</button></form></> : <><p>Abre un turno para registrar pedidos y cobros.</p><form onSubmit={openCash}><label>Fondo inicial en Bs<input required type="number" min="0" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} autoFocus /></label><button disabled={busy}>Abrir turno</button></form></>}{message && <p className="cash-dialog-error" role="alert">{message}</p>}</section></div>}
    {documentOrder && <OrderDocument order={documentOrder.order} kind={documentOrder.kind} onClose={() => setDocumentOrder(null)} />}

  </>, staff.role === 'cocina' ? 'Cocina y fichas' : 'Ventas')
}
