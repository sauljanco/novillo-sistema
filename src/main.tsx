import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './style.css'
import { Operations } from './Operations'
import { CustomerScreen } from './CustomerScreen'
import { BrandLogo } from './BrandLogo'

const modules = [
  { number: '01', title: 'Atención y pedidos', detail: 'Caja, ficha por turno y pantalla del cliente.' },
  { number: '02', title: 'Cierre de caja', detail: 'Movimientos, arqueos y reportes diarios.' },
  { number: '03', title: 'Personal', detail: 'Turnos, asistencia, adelantos y pagos por jornada o media jornada.' },
  { number: '04', title: 'Gestión', detail: 'Inventario, compras, proveedores, catálogo y reportes.' },
]

type Product = {
  id: string
  category: string
  name: string
  presentation: string
  price_cents: number
}

function Menu() {
  const [products, setProducts] = useState<Product[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/menu', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo cargar el menú')
        return response.json() as Promise<{ products: Product[] }>
      })
      .then(({ products }) => {
        setProducts(products)
        setState('ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error')
      })
    return () => controller.abort()
  }, [])

  const categories = [...new Set(products.map((product) => product.category))]

  return (
    <section className="menu-section" aria-labelledby="menu-title">
      <div className="section-heading"><div><span className="section-kicker">DATOS EN NEON</span><h2 id="menu-title">Menú inicial</h2></div><span className="section-count">Precios en Bs</span></div>
      <p className="menu-intro">Catálogo transcrito del menú recibido. Antes de operar, el restaurante debe confirmar nombres, presentaciones y precios.</p>
      {state === 'loading' && <p role="status">Cargando menú…</p>}
      {state === 'error' && <p role="alert">El menú no está disponible en este momento.</p>}
      {state === 'ready' && <div className="menu-grid">{categories.map((category) => (
        <div className="menu-category" key={category}>
          <h3>{category}</h3>
          {products.filter((product) => product.category === category).map((product) => (
            <div className="menu-row" key={product.id}>
              <div><strong>{product.name}</strong><small>{product.presentation}</small></div>
              <span>Bs {(product.price_cents / 100).toFixed(2)}</span>
            </div>
          ))}
        </div>
      ))}</div>}
    </section>
  )
}

function App() {
  return (
    <main className="page">
      <header className="topbar">
        <div className="brand"><BrandLogo /><span>NOVILLO</span></div>
        <a className="topbar-label" href="/?vista=operacion">Ingresar al sistema →</a>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> RESTAURANTE NOVILLO · SACABA</div>
          <h1 id="hero-title">La operación del restaurante, <em>en un solo lugar.</em></h1>
          <p>Atiende pedidos, cobra, organiza al equipo y controla el inventario y las compras desde un mismo sistema.</p>
          <div className="status"><span className="status-dot" /> Sistema activo</div>
        </div>
        <div className="hero-art" aria-hidden="true"><BrandLogo className="hero-logo" /><span className="art-caption">ESPECIALIDAD EN CARNES A LA PARRILLA</span></div>
      </section>

      <section className="modules" aria-labelledby="modules-title">
        <div className="section-heading"><div><span className="section-kicker">PANELES</span><h2 id="modules-title">Módulos del sistema</h2></div><span className="section-count">01 — 04</span></div>
        <div className="module-grid">{modules.map((module) => <article className="module" key={module.number}><span className="module-number">{module.number}</span><h3>{module.title}</h3><p>{module.detail}</p></article>)}</div>
      </section>
      <Menu />
      <footer>© {new Date().getFullYear()} Novillo <span>·</span> Sacaba, Cochabamba</footer>
    </main>
  )
}

const view = new URLSearchParams(location.search).get('vista')
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{view === 'cliente' ? <CustomerScreen /> : view === 'operacion' ? <Operations /> : <App />}</React.StrictMode>)
