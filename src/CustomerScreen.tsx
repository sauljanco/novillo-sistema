import { useEffect, useState } from 'react'
import { BrandLogo } from './BrandLogo'

type Display = { items: { name: string; presentation: string; quantity: number; price_cents: number }[]; total_cents: number; ticket_number: number | null; updated_at?: number }
export function CustomerScreen() {
  const [display, setDisplay] = useState<Display>({ items: [], total_cents: 0, ticket_number: null })
  useEffect(() => {
    const cached = localStorage.getItem('novillo-pantalla-cliente')
    if (cached) { try { const value: Display = JSON.parse(cached); if (value.updated_at && Date.now() - value.updated_at < 30 * 60 * 1000) setDisplay(value) } catch { /* ignore stale data */ } }
    const channel = new BroadcastChannel('novillo-pantalla-cliente')
    channel.onmessage = (event: MessageEvent<Display>) => setDisplay(event.data)
    return () => channel.close()
  }, [])
  return <main className="customer-screen"><div className="brand"><BrandLogo /><span>NOVILLO</span></div><h1>{display.ticket_number ? `Ficha Nº ${display.ticket_number}` : 'Tu pedido'}</h1>
    {display.items.length === 0 && <p>Tu pedido aparecerá aquí cuando el cajero agregue productos.</p>}
    {display.items.map((item, index) => <div className="customer-row" key={index}><span>{item.quantity} × {item.name} · {item.presentation}</span><strong>Bs {((item.quantity * item.price_cents) / 100).toFixed(2)}</strong></div>)}
    <div className="customer-total"><span>{display.ticket_number ? 'Total pagado' : 'Monto a cancelar'}</span><strong>Bs {(display.total_cents / 100).toFixed(2)}</strong></div>
  </main>
}
