import { useEffect, useState } from 'react'
import { BrandLogo } from './BrandLogo'
import './customer.css'

type DisplayItem = { name: string; presentation: string; quantity: number; price_cents: number; image_url?: string | null }
type Display = { items: DisplayItem[]; total_cents: number; ticket_number: number | null; updated_at?: number }
const empty: Display = { items: [], total_cents: 0, ticket_number: null }
const money = (cents: number) => `Bs ${(cents / 100).toFixed(2)}`

export function CustomerScreen() {
  const [display, setDisplay] = useState<Display>(empty)
  const [clock, setClock] = useState(new Date())
  useEffect(() => {
    const cached = localStorage.getItem('novillo-pantalla-cliente')
    if (cached) { try { const value: Display = JSON.parse(cached); if (value.updated_at && Date.now() - value.updated_at < 30 * 60 * 1000) setDisplay(value) } catch { /* ignore stale data */ } }
    const channel = new BroadcastChannel('novillo-pantalla-cliente')
    channel.onmessage = (event: MessageEvent<Display>) => setDisplay(event.data)
    const timer = window.setInterval(() => setClock(new Date()), 30_000)
    return () => { channel.close(); window.clearInterval(timer) }
  }, [])

  const paid = display.ticket_number !== null
  const hasItems = display.items.length > 0
  const featured = display.items.find((item) => item.image_url)
  const count = display.items.reduce((sum, item) => sum + item.quantity, 0)

  return <main className="guest-display">
    <div className="guest-atmosphere" aria-hidden="true" />
    <header className="guest-header"><div className="guest-brand"><BrandLogo /><div><strong>NOVILLO</strong><span>ESPECIALIDAD EN CARNES A LA PARRILLA</span></div></div><div className="guest-header-right"><span>SACABA · COCHABAMBA</span><time>{clock.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/La_Paz' })}</time></div></header>
    <div className="guest-body"><section className="guest-story"><div className="guest-story-copy"><span className="guest-kicker"><i /> EL SABOR DE REUNIRNOS</span><h1>{paid ? <>¡Gracias por<br /><em>elegirnos!</em></> : hasItems ? <>Tu momento<br /><em>empieza aquí.</em></> : <>Bienvenido<br /><em>a Novillo.</em></>}</h1><p>{paid ? 'Tu pedido ya está registrado. Conserva el número de ficha para retirar tu comida.' : hasItems ? 'Revisa los productos y el monto antes de pagar.' : 'Una buena comida se disfruta mejor en compañía. Tu pedido aparecerá aquí en un momento.'}</p></div><div className="guest-hero-art"><div className="guest-art-halo" />{featured?.image_url ? <img src={featured.image_url} alt={featured.name} /> : <BrandLogo />}<span>{featured ? featured.name : 'LA PARRILLA NOS REÚNE'}</span></div><div className="guest-story-footer"><span>01 / LA EXPERIENCIA NOVILLO</span><span>✦</span></div></section>
      <section className="guest-order" aria-live="polite"><div className="guest-order-top"><div><span className="guest-kicker">{paid ? 'PEDIDO CONFIRMADO' : 'EN TU MESA'}</span><h2>{paid ? `Ficha Nº ${display.ticket_number}` : 'Tu pedido'}</h2></div><span className={`guest-status ${paid ? 'paid' : hasItems ? 'in-progress' : ''}`}><i />{paid ? 'Pagado' : hasItems ? 'Por cobrar' : 'Esperando pedido'}</span></div>
      <div className="guest-order-list">{hasItems ? display.items.map((item, index) => <article className="guest-item" key={`${item.name}-${item.presentation}-${index}`}><div className="guest-item-photo">{item.image_url ? <img src={item.image_url} alt="" /> : <span aria-hidden="true">✦</span>}</div><div className="guest-item-info"><strong>{item.name}</strong><span>{item.presentation} · {item.quantity} × {money(item.price_cents)}</span></div><b>{money(item.quantity * item.price_cents)}</b></article>) : <div className="guest-empty"><span aria-hidden="true">✦</span><strong>Una mesa, grandes momentos.</strong><p>El detalle de tu pedido aparecerá aquí.</p></div>}</div>
      <div className="guest-total"><div><span>{paid ? 'TOTAL PAGADO' : 'MONTO A CANCELAR'}</span><strong>{money(display.total_cents)}</strong></div><p>{paid ? `Ficha ${display.ticket_number} · Gracias por tu visita` : hasItems ? `${count} ${count === 1 ? 'producto' : 'productos'} en tu pedido` : 'Te esperamos en la parrilla'}</p></div><div className="guest-order-footer"><span>PREPARADO PARA DISFRUTAR</span><span>NOVILLO · SACABA</span></div></section></div>
  </main>
}
