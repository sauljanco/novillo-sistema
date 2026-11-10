import { useEffect, useState } from 'react'
import { BrandLogo } from './BrandLogo'
import './customer.css'

type DisplayItem = { name: string; presentation: string; quantity: number; price_cents: number; image_url?: string | null }
type Display = { items: DisplayItem[]; total_cents: number; ticket_number: number | null; updated_at?: number }
const empty: Display = { items: [], total_cents: 0, ticket_number: null }
const money = (cents: number) => `Bs ${(cents / 100).toFixed(2)}`

export function CustomerScreen() {
  const [display, setDisplay] = useState<Display>(empty)
  useEffect(() => {
    const cached = localStorage.getItem('novillo-pantalla-cliente')
    if (cached) { try { const value: Display = JSON.parse(cached); if (value.updated_at && Date.now() - value.updated_at < 30 * 60 * 1000) setDisplay(value) } catch { /* ignore stale data */ } }
    const channel = new BroadcastChannel('novillo-pantalla-cliente')
    channel.onmessage = (event: MessageEvent<Display>) => setDisplay(event.data)
    return () => channel.close()
  }, [])

  const paid = display.ticket_number !== null
  const hasItems = display.items.length > 0
  const visibleItems = display.items.slice(0, 5)
  const remaining = display.items.length - visibleItems.length
  const count = display.items.reduce((sum, item) => sum + item.quantity, 0)

  return <main className="guest-display">
    <section className="guest-brand-stage" aria-label="Novillo">
      <div className="guest-logo-frame"><BrandLogo /></div>
    </section>
    <section className="guest-order" aria-live="polite">
      <header className="guest-order-heading">
        <h1>{paid ? `Ficha ${display.ticket_number}` : 'Tu pedido'}</h1>
        <span className={`guest-status ${paid ? 'paid' : hasItems ? 'in-progress' : ''}`}><i />{paid ? 'Pagado' : hasItems ? 'Por cobrar' : 'En espera'}</span>
      </header>
      <div className="guest-order-list">
        {hasItems ? <>{visibleItems.map((item, index) => <article className="guest-item" key={`${item.name}-${item.presentation}-${index}`}>
          <div className="guest-item-photo">{item.image_url ? <img src={item.image_url} alt="" /> : <span aria-hidden="true">✦</span>}</div>
          <div className="guest-item-info"><strong>{item.name}</strong><span>{item.presentation} · {item.quantity} × {money(item.price_cents)}</span></div>
          <b>{money(item.quantity * item.price_cents)}</b>
        </article>)}{remaining > 0 && <div className="guest-more">+ {remaining} {remaining === 1 ? 'producto más' : 'productos más'}</div>}</> : <div className="guest-empty"><span aria-hidden="true">✦</span><strong>Esperando tu pedido</strong></div>}
      </div>
      <footer className="guest-total"><div><span>{paid ? 'TOTAL PAGADO' : 'TOTAL A PAGAR'}</span><strong>{money(display.total_cents)}</strong></div>{hasItems && <small>{count} {count === 1 ? 'producto' : 'productos'}</small>}</footer>
    </section>
  </main>
}
