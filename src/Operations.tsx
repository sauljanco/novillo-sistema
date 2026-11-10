import { useEffect, useLayoutEffect, useState } from 'react'
import { authorizedFetch, neonAuth } from './auth'
import { AdminPanels, adminTabs } from './AdminPanels'
import { BrandLogo } from './BrandLogo'
import { PanelIcon, type IconName } from './PanelIcon'
import { categoriesWithProducts } from './menuCategories'
import './modern.css'
import './identity.css'
import './sales.css'
import './sales-metrics.css'
import './order-flow.css'
import './theme-dark.css'

type Product = { id: string; category: string; name: string; presentation: string; price_cents: number; image_url: string | null }
type Staff = { display_name: string; role: 'superadministrador' | 'administrador' | 'caja' | 'cocina' }
type Cash = { id: string; opening_cash_cents: number; cash_sales_cents: number; qr_sales_cents: number }
type Order = { id: string; service_date: string; ticket_number: number; total_cents: number; payment_method: string | null; paid_at: string | null; created_at: string; status: string; items: { name: string; presentation: string; quantity: number; unit_price_cents: number; line_total_cents: number }[] }
const money = (cents: number) => `Bs ${(cents / 100).toFixed(2)}`
function OrderDocument({ order, kind, onClose }: { order: Order; kind: 'ficha' | 'recibo'; onClose: () => void }) {
  const timestamp = kind === 'recibo' ? order.paid_at : order.created_at
  return <div className="document-overlay" role="dialog" aria-modal="true" aria-label={kind === 'ficha' ? 'Ficha de pedido' : 'Recibo de pago'}>
    <div className="document-preview">
      <div className="document-actions"><button type="button" className="secondary-utility" onClick={onClose}>Cerrar</button><button type="button" onClick={() => window.print()}>Imprimir {kind}</button></div>
      <div className="order-document"><div className="document-brand">NOVILLO</div><div className="document-subtitle">{kind === 'ficha' ? 'FICHA DE PEDIDO' : 'RECIBO DE PAGO'}</div><strong className="document-number">Nº {order.ticket_number}</strong><p>{timestamp ? new Date(timestamp).toLocaleString('es-BO', { timeZone: 'America/La_Paz' }) : ''}</p><div className="document-lines">{order.items.map((item, index) => <div key={`${item.name}-${index}`}><span>{item.quantity} × {item.name}<small>{item.presentation}</small></span><strong>{money(item.line_total_cents)}</strong></div>)}</div><div className="document-total"><span>{kind === 'ficha' ? 'Total del pedido' : 'Total pagado'}</span><strong>{money(order.total_cents)}</strong></div><p>{kind === 'ficha' ? 'Pago pendiente · Conserva este número para solicitar la cuenta.' : `Pagado con ${order.payment_method === 'qr' ? 'QR' : 'efectivo'} · Gracias por tu visita.`}</p></div>
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
  const [opening, setOpening] = useState('0')
  const [counted, setCounted] = useState('0')
  const [closing, setClosing] = useState<{ expected_cash_cents: number; difference_cents: number } | null>(null)
  const [method, setMethod] = useState<'efectivo' | 'qr'>('efectivo')
  const [panel, setPanel] = useState('operacion')
  const [operationView, setOperationView] = useState<'venta' | 'fichas'>('venta')
  const [showClosing, setShowClosing] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Todos')
  const [busy, setBusy] = useState(false)
  const [lastTicket, setLastTicket] = useState<number | null>(null)
  const [lastPaid, setLastPaid] = useState(false)
  const [lastPaidTotal, setLastPaidTotal] = useState(0)
  const [lastPaidItems, setLastPaidItems] = useState<{ name: string; presentation: string; quantity: number; price_cents: number; image_url: string | null }[]>([])
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null)
  const [documentOrder, setDocumentOrder] = useState<{ order: Order; kind: 'ficha' | 'recibo' } | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('novillo-theme') === 'dark' ? 'dark' : 'light')

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('novillo-theme', theme)
  }, [theme])
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
  useEffect(() => {
    const channel = new BroadcastChannel('novillo-pantalla-cliente')
    const display = { items: lastTicket ? lastPaidItems : cartItems.map((p) => ({ name: p.name, presentation: p.presentation, quantity: cart[p.id], price_cents: p.price_cents, image_url: p.image_url })), total_cents: lastTicket ? lastPaidTotal : total, ticket_number: lastTicket, paid: lastPaid, updated_at: Date.now() }
    channel.postMessage(display)
    localStorage.setItem('novillo-pantalla-cliente', JSON.stringify(display))
    channel.close()
  }, [cart, products, total, lastTicket, lastPaid, lastPaidTotal, lastPaidItems])

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
      await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo abrir caja') }
    finally { setBusy(false) }
  }

  async function createOrder() {
    if (!cash || cartItems.length === 0) return
    setBusy(true); setMessage('')
    try {
      const res = await authorizedFetch('/api/orders', { method: 'POST', body: JSON.stringify({
        cash_session_id: Number(cash.id),
        items: cartItems.map((p) => ({ product_id: Number(p.id), quantity: cart[p.id] })),
      }) })
      if (!res.ok) throw new Error((await res.json()).error)
      const data = await res.json()
      setLastPaidItems(data.order.items.map((item: Order['items'][number]) => ({ name: item.name, presentation: item.presentation, quantity: item.quantity, price_cents: item.unit_price_cents, image_url: null })))
      setLastPaidTotal(data.order.total_cents)
      setLastTicket(data.order.ticket_number)
      setLastPaid(false)
      setCart({})
      setMessage(`Ficha Nº ${data.order.ticket_number} emitida. Cobro pendiente.`)
      setDocumentOrder({ kind: 'ficha', order: data.order })
      setOperationView('fichas')
      await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo registrar el pedido') }
    finally { setBusy(false) }
  }

  async function collectOrder(order: Order) {
    if (!cash || order.paid_at) return
    setBusy(true); setMessage('')
    try {
      const res = await authorizedFetch('/api/order-payment', { method: 'POST', body: JSON.stringify({ order_id: Number(order.id), cash_session_id: Number(cash.id), payment_method: method }) })
      if (!res.ok) throw new Error((await res.json()).error)
      const data = await res.json()
      const paidOrder = { ...order, ...data.order }
      setPaymentOrderId(null)
      setLastTicket(order.ticket_number)
      setLastPaid(true)
      setLastPaidTotal(order.total_cents)
      setLastPaidItems(order.items.map((i) => ({ name: i.name, presentation: i.presentation, quantity: i.quantity, price_cents: i.unit_price_cents, image_url: null })))
      setDocumentOrder({ kind: 'recibo', order: paidOrder })
      setMessage(`Cobro registrado. Recibo Nº ${order.ticket_number} listo.`)
      await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo registrar el cobro') }
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
      setClosing((await res.json()).closing)
      setShowClosing(false)
      await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo cerrar la caja') }
    finally { setBusy(false) }
  }

  async function advanceOrder(order: Order) {
    const next = order.status === 'pendiente' ? 'preparando' : order.status === 'preparando' ? 'listo' : order.status === 'listo' ? 'entregado' : null
    if (!next) return
    setBusy(true); setMessage('')
    try {
      const response = await authorizedFetch('/api/order-status', { method: 'POST', body: JSON.stringify({ order_id: Number(order.id), status: next }) })
      if (!response.ok) throw new Error((await response.json()).error)
      await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo actualizar la ficha') }
    finally { setBusy(false) }
  }

  if (session.isPending) return <section className="auth-screen">{authThemeButton}<div className="auth-card"><p>Comprobando sesión…</p></div></section>
  if (!session.data?.user) return <section className="auth-screen">{authThemeButton}<div className="auth-card"><div className="auth-brand"><BrandLogo /><span>NOVILLO</span></div><span className="section-kicker">SISTEMA DE GESTIÓN</span><h2>Bienvenido de nuevo</h2><p className="auth-intro">Ingresa para continuar con la operación del restaurante.</p>
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

  const shell = (content: React.ReactNode, title: string) => <div className="app-shell"><aside className="app-sidebar"><a className="side-brand" href="/"><BrandLogo /><span>NOVILLO</span></a>{navigation}<div className="side-profile"><span className="profile-avatar">{staff.display_name.slice(0, 2).toUpperCase()}</span><span><strong>{staff.display_name}</strong><small>{staff.role === 'superadministrador' ? 'Superadministrador' : staff.role === 'caja' ? 'Caja y ventas' : staff.role}</small></span></div></aside><div className="app-main"><header className="app-topbar"><h1 className="topbar-title">{title}</h1><div className="topbar-right">{panel === 'operacion' && cash && <span className="cash-status">● Caja abierta · #{cash.id}</span>}<button className="theme-toggle" aria-label={theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'} title={theme === 'light' ? 'Modo oscuro' : 'Modo claro'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}><PanelIcon name={theme === 'light' ? 'moon' : 'sun'} /></button><button className="logout-button" onClick={() => neonAuth!.signOut()}><PanelIcon name="logout" /> <span>Salir</span></button></div></header><main className="work-panel">{content}</main></div></div>

  if (panel !== 'operacion' && isAdmin) return shell(<AdminPanels panel={panel} isSuper={staff.role === 'superadministrador'} />, adminTabs.find(([key]) => key === panel)?.[1] || 'Gestión')

  return shell(<>
    {message && <p role="status" className="notice">{message}</p>}
    {closing && <p className="notice" role="status">Caja cerrada. Efectivo esperado {money(closing.expected_cash_cents)} · Diferencia {money(closing.difference_cents)}.</p>}
    {staff.role !== 'cocina' && cash && <><div className="cash-summary sales-metrics"><span><small>CAJA ACTIVA</small><strong>Nº {cash.id}</strong></span><span><small>FONDO INICIAL</small><strong>{money(cash.opening_cash_cents)}</strong></span><span><small>VENTAS EN EFECTIVO</small><strong>{money(cash.cash_sales_cents)}</strong></span><span><small>VENTAS CON QR</small><strong>{money(cash.qr_sales_cents)}</strong></span></div><div className="panel-toolbar operation-toolbar"><div className="panel-sections" role="tablist" aria-label="Vistas de ventas"><button type="button" role="tab" aria-selected={operationView === 'venta'} className={operationView === 'venta' && !showClosing ? 'active' : ''} onClick={() => { setOperationView('venta'); setShowClosing(false) }}>Nuevo pedido</button><button type="button" role="tab" aria-selected={operationView === 'fichas'} className={operationView === 'fichas' && !showClosing ? 'active' : ''} onClick={() => { setOperationView('fichas'); setShowClosing(false) }}>Pedidos <span className="tab-count">{orders.length}</span></button></div><button type="button" className="secondary-utility" onClick={() => setShowClosing(true)}>Cerrar caja</button></div></>}
    {staff.role !== 'cocina' && !cash && <form onSubmit={openCash} className="cash-open"><h3>Abrir caja</h3><label>Fondo inicial en Bs<input type="number" min="0" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} /></label><button disabled={busy}>Abrir turno</button></form>}
    {staff.role !== 'cocina' && cash && showClosing && <div className="editor-stage"><button type="button" className="back-button" onClick={() => setShowClosing(false)}>← Volver a la operación</button><form onSubmit={closeCash} className="admin-form editor-form"><h3>Cerrar caja</h3><p className="form-help">Efectivo esperado: {money(cash.opening_cash_cents + cash.cash_sales_cents)} · Ventas QR: {money(cash.qr_sales_cents)}.</p><label>Efectivo contado en Bs<input required type="number" min="0" step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} /></label><div className="form-actions"><button disabled={busy}>Guardar arqueo y cerrar</button><button type="button" className="secondary" onClick={() => setShowClosing(false)}>Cancelar</button></div></form></div>}
    {staff.role !== 'cocina' && cash && !showClosing && operationView === 'venta' && <div className="order-layout sales-layout">
      <div className="catalog-panel sales-catalog"><div className="sales-panel-heading"><div><span className="sales-eyebrow">CATÁLOGO</span><h3>Elige los productos</h3></div><span>{visibleProducts.length} disponibles</span></div><input className="product-search" type="search" placeholder="Buscar por nombre o categoría" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar productos" /><div className="category-filter">{categories.map((c) => <button key={c} className={category === c ? 'selected' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div><div className="product-list sales-product-grid">{visibleProducts.map((p) => <button type="button" key={p.id} className="sales-product-card" onClick={() => { setLastTicket(null); setLastPaid(false); setCart((current) => ({ ...current, [p.id]: (current[p.id] ?? 0) + 1 })) }}><span className="sales-product-image">{p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : <span className="sales-image-mark" aria-hidden="true">✦</span>}{cart[p.id] > 0 && <span className="sales-product-count">{cart[p.id]}</span>}</span><span className="sales-product-details"><span className="sales-product-category">{p.category}</span><span className="product-name">{p.name}<small>{p.presentation}</small></span><span className="sales-product-bottom"><strong>{money(p.price_cents)}</strong><span aria-hidden="true">＋</span></span></span></button>)}{visibleProducts.length === 0 && <p className="sales-empty">Aún no hay productos en esta categoría o búsqueda.</p>}</div></div>
      <div className="cart sales-cart"><div className="sales-cart-heading"><div><span className="sales-eyebrow">NUEVO PEDIDO</span><h3>Pedido actual</h3></div><span>{cartItems.reduce((sum, p) => sum + cart[p.id], 0)} artículos</span></div>{cartItems.length === 0 && <div className="sales-cart-empty"><span aria-hidden="true">✦</span><strong>La mesa está lista</strong><p>Elige un producto para comenzar el pedido.</p></div>}{cartItems.map((p) => <div className="cart-row" key={p.id}><span>{p.name}<small>{p.presentation} · {cart[p.id]} × {money(p.price_cents)}</small></span><button aria-label={`Quitar un ${p.name}`} onClick={() => setCart((current) => ({ ...current, [p.id]: current[p.id] - 1 }))}>−</button><strong>{money(p.price_cents * cart[p.id])}</strong></div>)}<div className="sales-checkout"><div className="cart-total"><span>Total del pedido</span><strong>{money(total)}</strong></div><button disabled={busy || cartItems.length === 0} onClick={createOrder}>Registrar pedido y emitir ficha <span aria-hidden="true">↗</span></button><a href="/?vista=cliente" target="_blank" rel="noreferrer">Abrir pantalla del cliente ↗</a></div></div>
    </div>}
    {(staff.role === 'cocina' || (operationView === 'fichas' && !showClosing)) && <section className="tickets-view">
      <div className="list-heading"><h3>Pedidos y cuentas</h3><span>{orders.filter((order) => !order.paid_at && order.status !== 'anulado').length} por cobrar · {orders.length} registros</span></div>
      <div className="ticket-list">{orders.length === 0 && <p className="empty-tickets">Todavía no hay pedidos para este turno.</p>}
        {orders.map((order) => <article className="order-record" key={order.id}>
          <div className="order-record-main"><strong>Nº {order.ticket_number}</strong><span>{order.items.map((item) => `${item.quantity} ${item.name}`).join(', ')}</span><b>{money(order.total_cents)}</b></div>
          <div className="order-record-meta"><span className={order.paid_at ? 'payment-badge paid' : 'payment-badge pending'}>{order.paid_at ? `Pagado · ${order.payment_method === 'qr' ? 'QR' : 'efectivo'}` : 'Pendiente de cobro'}</span><span>{new Date(order.service_date).toLocaleDateString('es-BO', { timeZone: 'UTC' })} · Preparación: {order.status}</span></div>
          <div className="order-record-actions"><button type="button" className="secondary-utility" onClick={() => setDocumentOrder({ order, kind: order.paid_at ? 'recibo' : 'ficha' })}>Ver {order.paid_at ? 'recibo' : 'ficha'}</button>
            {staff.role !== 'cocina' && cash && !order.paid_at && order.status !== 'anulado' && <button type="button" onClick={() => setPaymentOrderId(paymentOrderId === order.id ? null : order.id)}>Cobrar pedido</button>}
            {['superadministrador','administrador','cocina'].includes(staff.role) && ['pendiente','preparando','listo'].includes(order.status) && <button type="button" className="secondary-utility" disabled={busy} onClick={() => advanceOrder(order)}>{order.status === 'pendiente' ? 'Preparar' : order.status === 'preparando' ? 'Marcar listo' : 'Entregar'}</button>}
          </div>
          {paymentOrderId === order.id && <div className="order-collection"><div><strong>Cuenta Nº {order.ticket_number}</strong><span>{money(order.total_cents)}</span></div><label>Medio de pago<select value={method} onChange={(event) => setMethod(event.target.value as 'efectivo' | 'qr')}><option value="efectivo">Efectivo</option><option value="qr">QR</option></select></label><button type="button" disabled={busy} onClick={() => collectOrder(order)}>Confirmar cobro y generar recibo</button></div>}
        </article>)}
      </div>
    </section>}
    {documentOrder && <OrderDocument order={documentOrder.order} kind={documentOrder.kind} onClose={() => setDocumentOrder(null)} />}

  </>, staff.role === 'cocina' ? 'Cocina y fichas' : 'Ventas')
}
