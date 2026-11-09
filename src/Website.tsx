import { useEffect, useState } from 'react'
import { BrandLogo } from './BrandLogo'
import './website.css'

type Product = {
  id: string
  category: string
  name: string
  presentation: string
  price_cents: number
  image_url: string | null
}

const locationUrl = 'https://www.google.com/maps/search/?api=1&query=Av+Villazon+entre+Padilla+y+Benemeritos+de+la+Patria+Sacaba+Cochabamba'
const money = (cents: number) => `Bs ${(cents / 100).toFixed(2)}`

export function Website() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [menuState, setMenuState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [category, setCategory] = useState('Carnes')

  useEffect(() => {
    document.title = 'Novillo · Parrilla en Sacaba'
    const controller = new AbortController()
    fetch('/api/menu', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo cargar el menú')
        return response.json() as Promise<{ products: Product[] }>
      })
      .then(({ products: list }) => {
        setProducts(list)
        if (!list.some((product) => product.category === 'Carnes')) setCategory(list[0]?.category || 'Todos')
        setMenuState('ready')
      })
      .catch(() => { if (!controller.signal.aborted) setMenuState('error') })
    return () => controller.abort()
  }, [])

  const categories = [...new Set(products.map((product) => product.category))]
  const shownProducts = products.filter((product) => product.category === category)
  const closeNav = () => setMenuOpen(false)

  return <div className="site">
    <header className="site-header">
      <div className="site-container site-header-inner">
        <a className="site-brand" href="#inicio" onClick={closeNav} aria-label="Novillo, ir al inicio"><BrandLogo /><span>NOVILLO<small>Parrilla · Sacaba</small></span></a>
        <nav className={`site-nav ${menuOpen ? 'site-nav-open' : ''}`} aria-label="Navegación principal">
          <a href="#inicio" onClick={closeNav}>Inicio</a>
          <a href="#nosotros" onClick={closeNav}>Quiénes somos</a>
          <a href="#menu" onClick={closeNav}>Menú</a>
          <a href="#ubicacion" onClick={closeNav}>Ubicación</a>
        </nav>
        <div className="site-header-actions">
          <a className="site-access" href="/?vista=operacion">Acceder <span className="site-access-long">al sistema</span> <span aria-hidden="true">↗</span></a>
          <button className="site-menu-toggle" type="button" aria-label={menuOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><span /><span /><span /></button>
        </div>
      </div>
    </header>

    <main>
      <section className="site-hero" id="inicio" aria-labelledby="site-hero-title">
        <div className="site-container site-hero-grid">
          <div className="site-hero-copy">
            <span className="site-eyebrow"><i /> SACABA · COCHABAMBA</span>
            <h1 id="site-hero-title">La parrilla sabe mejor <em>cuando se comparte.</em></h1>
            <p>Cortes a la parrilla, sabores de siempre y una mesa lista para disfrutar. Bienvenido a Novillo.</p>
            <div className="site-hero-actions"><a className="site-button" href="#menu">Explorar el menú <span aria-hidden="true">↗</span></a><a className="site-button-outline" href="#ubicacion">Cómo llegar <span aria-hidden="true">↗</span></a></div>
            <div className="site-hero-note"><span className="site-note-line" /> Especialidad en carnes a la parrilla</div>
          </div>
          <div className="site-hero-visual" aria-label="Identidad del restaurante Novillo"><div className="site-hero-glow" /><BrandLogo className="site-hero-logo" /><div className="site-hero-visual-footer"><span>EL SABOR DE REUNIRNOS</span><span>01 / NOVILLO</span></div></div>
        </div>
      </section>

      <section className="site-intro" id="nosotros" aria-labelledby="site-intro-title">
        <div className="site-container site-intro-grid"><div><span className="site-section-label">LA EXPERIENCIA NOVILLO</span><h2 id="site-intro-title">El fuego reúne.<br /><em>La mesa conecta.</em></h2></div><div className="site-intro-copy"><p>En Novillo la especialidad son las carnes a la parrilla. Preparamos una experiencia para compartir entre amigos y familia, con cortes, aves, bebidas y acompañamientos para cada gusto.</p><p>Los cortes incluyen un entremés y buffet de guarniciones y ensaladas, según nuestro menú.</p><a href="#menu">Conoce lo que servimos <span aria-hidden="true">→</span></a></div></div>
      </section>

      <section className="site-features" aria-label="Lo que encontrarás en Novillo"><div className="site-container site-features-grid"><article><span>01</span><h3>Cortes a la parrilla</h3><p>La especialidad de la casa, con distintas opciones para elegir.</p></article><article><span>02</span><h3>Para compartir</h3><p>Parrilla mixta, pique macho y platos que invitan a reunirse.</p></article><article><span>03</span><h3>Algo para cada mesa</h3><p>Aves, guarniciones, jugos, gaseosas, cerveza y vinos.</p></article></div></section>

      <section className="site-menu-section" id="menu" aria-labelledby="site-menu-title"><div className="site-container"><div className="site-section-heading"><div><span className="site-section-label">SABORES DE NOVILLO</span><h2 id="site-menu-title">Nuestro menú</h2><p>Explora los platos y bebidas disponibles. Precios en bolivianos.</p></div><span className="site-menu-number">MENÚ / 01</span></div>
        {menuState === 'loading' && <p className="site-menu-message" role="status">Cargando menú…</p>}
        {menuState === 'error' && <p className="site-menu-message" role="alert">El menú no está disponible en este momento.</p>}
        {menuState === 'ready' && <><div className="site-menu-categories" role="group" aria-label="Categorías del menú">{categories.map((name) => <button key={name} type="button" className={name === category ? 'active' : ''} aria-pressed={name === category} onClick={() => setCategory(name)}>{name}</button>)}</div><div className="site-menu-list">{shownProducts.map((product) => <article className="site-menu-item" key={product.id}><div className="site-menu-thumb">{product.image_url ? <img src={product.image_url} alt="" loading="lazy" /> : <span aria-hidden="true">✦</span>}</div><div><h3>{product.name}</h3><p>{product.presentation}</p></div><strong>{money(product.price_cents)}</strong></article>)}</div></>}
        <p className="site-menu-footnote">Los cortes incluyen un entremés y buffet de guarniciones y ensaladas.</p>
      </div></section>

      <section className="site-visit" id="ubicacion" aria-labelledby="site-visit-title"><div className="site-container site-visit-grid"><div><span className="site-section-label">ENCUÉNTRANOS</span><h2 id="site-visit-title">Nos vemos <em>en Novillo.</em></h2><p>Av. Villazón, entre Padilla y Beneméritos de la Patria<br />Sacaba, Cochabamba</p><a className="site-button" href={locationUrl} target="_blank" rel="noreferrer">Abrir ubicación <span aria-hidden="true">↗</span></a></div><div className="site-visit-art" aria-hidden="true"><span>SACABA</span><strong>Una buena mesa<br />siempre espera.</strong><i /></div></div></section>
    </main>

    <footer className="site-footer"><div className="site-container site-footer-inner"><div className="site-footer-brand"><BrandLogo /><span>NOVILLO<small>Especialidad en carnes a la parrilla</small></span></div><nav aria-label="Enlaces del pie de página"><a href="#inicio">Inicio</a><a href="#nosotros">Quiénes somos</a><a href="#menu">Menú</a><a href="#ubicacion">Ubicación</a><a href="/?vista=operacion">Acceder al sistema</a></nav><small>© {new Date().getFullYear()} Novillo · Sacaba, Cochabamba</small></div></footer>
  </div>
}
