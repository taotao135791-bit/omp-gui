import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { useAppStore } from './store'
import './index.css'

// Handle for E2E driving via CDP and power-user debugging (read-only intent;
// exposed in production too so automation works against packaged builds)
;(window as unknown as { __store: typeof useAppStore }).__store = useAppStore

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
