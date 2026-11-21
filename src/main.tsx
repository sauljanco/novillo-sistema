import React from 'react'
import ReactDOM from 'react-dom/client'
import './style.css'
import { Operations } from './Operations'
import { Website } from './Website'

const view = new URLSearchParams(location.search).get('vista')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {view === 'operacion' ? <Operations /> : <Website />}
  </React.StrictMode>,
)
