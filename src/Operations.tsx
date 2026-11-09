import { useEffect, useState } from 'react'
import { authorizedFetch, neonAuth } from './auth'
import { AdminPanels, adminTabs } from './AdminPanels'

type Product = { id: string; category: string; name: string; presentation: string; price_cents: number }
type Staff = { display_name: string; role: 'superadministrador' | 'administrador' | 'caja' | 'cocina' }
type Cash = { id: string; opening_cash_cents: number; cash_sales_cents: number; qr_sales_cents: number }
type Order = { id: string; ticket_number: number; total_cents: number; payment_method: string; status: string; items: { name: string; presentation: string; quantity: number }[] }
const money = (cents: number) => `Bs ${(cents / 100).toFixed(2)}`

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
  const [busy, setBusy] = useState(false)
  const [lastTicket, setLastTicket] = useState<number | null>(null)
  const [lastPaidTotal, setLastPaidTotal] = useState(0)
  const [lastPaidItems, setLastPaidItems] = useState<{ name: string; presentation: string; quantity: number; price_cents: number }[]>([])

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
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      authorizedFetch('/api/orders').then(async (response) => {
        if (response.ok) setOrders((await response.json()).orders)
      }).catch(() => {})
    }, 10000)
    return () => window.clearInterval(timer)
  }, [session.data?.user?.id, panel])

  const cartItems = products.filter((p) => cart[p.id] > 0)
  const total = cartItems.reduce((sum, p) => sum + p.price_cents * cart[p.id], 0)
  useEffect(() => {
    const channel = new BroadcastChannel('novillo-pantalla-cliente')
    const display = { items: lastTicket ? lastPaidItems : cartItems.map((p) => ({ name: p.name, presentation: p.presentation, quantity: cart[p.id], price_cents: p.price_cents })), total_cents: lastTicket ? lastPaidTotal : total, ticket_number: lastTicket, updated_at: Date.now() }
    channel.postMessage(display)
    localStorage.setItem('novillo-pantalla-cliente', JSON.stringify(display))
    channel.close()
  }, [cart, products, total, lastTicket, lastPaidTotal, lastPaidItems])

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

  async function charge() {
    if (!cash || cartItems.length === 0) return
    setBusy(true); setMessage('')
    try {
      const res = await authorizedFetch('/api/orders', { method: 'POST', body: JSON.stringify({
        cash_session_id: Number(cash.id), payment_method: method,
        items: cartItems.map((p) => ({ product_id: Number(p.id), quantity: cart[p.id] })),
      }) })
      if (!res.ok) throw new Error((await res.json()).error)
      const data = await res.json()
      setLastPaidItems(cartItems.map((p) => ({ name: p.name, presentation: p.presentation, quantity: cart[p.id], price_cents: p.price_cents })))
      setLastPaidTotal(total)
      setLastTicket(data.order.ticket_number)
      setCart({})
      setMessage(`Cobro registrado. Ficha Nº ${data.order.ticket_number}.`)
      await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo registrar el pedido') }
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

  if (session.isPending) return <section className="work-panel"><p>Comprobando sesión…</p></section>
  if (!session.data?.user) return <section className="work-panel"><h2>Acceso del personal</h2>
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
  </section>

  if (session.data.user.emailVerified === false) return <section className="work-panel"><h2>Verifica tu correo</h2><p>La cuenta necesita un código enviado a {session.data.user.email}.</p>
    <form className="auth-form" onSubmit={async (event) => { event.preventDefault(); setBusy(true); const result = await neonAuth!.emailOtp.verifyEmail({ email: session.data!.user.email, otp }); setMessage(result.error ? (result.error.message ?? 'Código inválido') : 'Correo verificado. Actualizando sesión…'); setBusy(false); if (!result.error) location.reload() }}>
      <label>Código de verificación<input required inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value)} /></label><button disabled={busy}>Verificar correo</button>
    </form><button className="text-button" onClick={async () => { const result = await neonAuth!.emailOtp.sendVerificationOtp({ email: session.data!.user.email, type: 'email-verification' }); setMessage(result.error ? (result.error.message ?? 'No se pudo enviar') : 'Código enviado.') }}>Enviar código</button>{message && <p role="status">{message}</p>}
  </section>

  if (!staff) return <section className="work-panel"><h2>Acceso pendiente</h2><p>{message || 'Comprobando tu autorización…'}</p><button onClick={() => refresh().catch((error) => setMessage(error instanceof Error ? error.message : 'No se pudo validar la sesión.'))}>Reintentar</button> <button onClick={() => neonAuth!.signOut()}>Salir</button></section>

  const isAdmin = staff.role === 'superadministrador' || staff.role === 'administrador'
  const navigation = <nav className="panel-nav" aria-label="Paneles del sistema">
    <button className={panel === 'operacion' ? 'selected' : ''} onClick={() => setPanel('operacion')}>{staff.role === 'cocina' ? 'Cocina' : 'Atención y caja'}</button>
    {isAdmin && adminTabs.filter(([key]) => key !== 'accesos' || staff.role === 'superadministrador').map(([key, label]) =>
      <button key={key} className={panel === key ? 'selected' : ''} onClick={() => setPanel(key)}>{label}</button>)}
  </nav>

  if (panel !== 'operacion' && isAdmin) return <section className="work-panel"><div className="work-header"><div><span className="section-kicker">SISTEMA DE GESTIÓN</span><p>{staff.display_name} · {staff.role}</p></div><button className="text-button" onClick={() => neonAuth!.signOut()}>Salir</button></div>{navigation}<AdminPanels panel={panel} isSuper={staff.role === 'superadministrador'} /></section>

  return <section className="work-panel"><div className="work-header"><div><span className="section-kicker">OPERACIÓN</span><h2>{staff.role === 'cocina' ? 'Cocina y fichas' : 'Atención y caja'}</h2><p>{staff.display_name} · {staff.role === 'caja' ? 'caja y ventas' : staff.role}</p></div><button className="text-button" onClick={() => neonAuth!.signOut()}>Salir</button></div>{navigation}
    {message && <p role="status" className="notice">{message}</p>}
    {closing && <p className="notice" role="status">Caja cerrada. Efectivo esperado {money(closing.expected_cash_cents)} · Diferencia {money(closing.difference_cents)}.</p>}
    {staff.role !== 'cocina' && (!cash ? <form onSubmit={openCash} className="cash-open"><h3>Abrir caja</h3><label>Fondo inicial en Bs<input type="number" min="0" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} /></label><button disabled={busy}>Abrir turno</button></form>
      : <><div className="cash-summary"><span>Caja Nº {cash.id}</span><span>Fondo {money(cash.opening_cash_cents)}</span><span>Efectivo vendido {money(cash.cash_sales_cents)}</span><span>QR vendido {money(cash.qr_sales_cents)}</span></div>
        <div className="order-layout"><div><h3>Agregar productos</h3><div className="product-list">{products.map((p) => <button key={p.id} onClick={() => { setLastTicket(null); setCart({ ...cart, [p.id]: (cart[p.id] ?? 0) + 1 }) }}>{p.name} · {p.presentation}<span>{money(p.price_cents)}</span></button>)}</div></div>
          <div className="cart"><h3>Pedido actual</h3>{cartItems.length === 0 && <p>Selecciona productos.</p>}{cartItems.map((p) => <div className="cart-row" key={p.id}><span>{p.name} × {cart[p.id]}</span><button aria-label={`Quitar un ${p.name}`} onClick={() => setCart({ ...cart, [p.id]: cart[p.id] - 1 })}>−</button><strong>{money(p.price_cents * cart[p.id])}</strong></div>)}<strong className="cart-total">Total {money(total)}</strong><label>Medio de pago<select value={method} onChange={(e) => setMethod(e.target.value as 'efectivo' | 'qr')}><option value="efectivo">Efectivo</option><option value="qr">QR</option></select></label><button disabled={busy || cartItems.length === 0} onClick={charge}>Registrar cobro y emitir ficha</button><a href="/?vista=cliente" target="_blank" rel="noreferrer">Abrir segunda pantalla ↗</a></div></div></>)}
    {staff.role !== 'cocina' && cash && <form onSubmit={closeCash} className="cash-open"><h3>Cerrar caja</h3><p>Efectivo esperado: {money(cash.opening_cash_cents + cash.cash_sales_cents)}. Ventas QR: {money(cash.qr_sales_cents)}.</p><label>Efectivo contado en Bs<input required type="number" min="0" step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} /></label><button disabled={busy}>Guardar arqueo y cerrar</button></form>}
    <h3>Fichas de hoy</h3><div className="ticket-list">{orders.map((o) => <div key={o.id}><strong>#{o.ticket_number}</strong><span>{o.items.map((i) => `${i.quantity} ${i.name}`).join(', ')}</span><span>{money(o.total_cents)} · {o.payment_method} · {o.status}</span>{['superadministrador','administrador','cocina'].includes(staff.role) && ['pendiente','preparando','listo'].includes(o.status) && <button disabled={busy} onClick={() => advanceOrder(o)}>{o.status === 'pendiente' ? 'Preparar' : o.status === 'preparando' ? 'Marcar listo' : 'Entregar'}</button>}</div>)}</div>
  </section>
}
