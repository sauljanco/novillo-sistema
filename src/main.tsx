import React from 'react'
import ReactDOM from 'react-dom/client'
import './style.css'

const modules = [
  { number: '01', title: 'Atención y pedidos', detail: 'Caja, ficha por turno y pantalla del cliente.' },
  { number: '02', title: 'Cierre de caja', detail: 'Movimientos, arqueos y reportes diarios.' },
  { number: '03', title: 'Personal', detail: 'Turnos, asistencia y pagos por jornada o media jornada.' },
  { number: '04', title: 'Inventario', detail: 'Productos, compras, inversión y proveedores.' },
]

function App() {
  return (
    <main className="page">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">N</span><span>NOVILLO<span className="brand-dot">.</span></span></div>
        <span className="topbar-label">Sistema de gestión</span>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> RESTAURANTE NOVILLO · SACABA</div>
          <h1 id="hero-title">La operación del restaurante, <em>en un solo lugar.</em></h1>
          <p>Estamos construyendo el sistema para atender pedidos, cobrar, organizar al equipo y controlar cada movimiento del negocio.</p>
          <div className="status"><span className="status-dot" /> Plataforma en preparación</div>
        </div>
        <div className="hero-art" aria-hidden="true"><span className="art-circle" /><span className="art-letter">N</span><span className="art-caption">ESPECIALIDAD EN CARNES A LA PARRILLA</span></div>
      </section>

      <section className="modules" aria-labelledby="modules-title">
        <div className="section-heading"><div><span className="section-kicker">PRÓXIMAMENTE</span><h2 id="modules-title">Módulos del sistema</h2></div><span className="section-count">01 — 04</span></div>
        <div className="module-grid">{modules.map((module) => <article className="module" key={module.number}><span className="module-number">{module.number}</span><h3>{module.title}</h3><p>{module.detail}</p></article>)}</div>
      </section>
      <footer>© {new Date().getFullYear()} Novillo <span>·</span> Sacaba, Cochabamba</footer>
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
