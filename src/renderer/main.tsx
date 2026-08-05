import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { useAppStore } from './store'
import './index.css'

// Dev-only handle for E2E driving via CDP (stripped from production builds)
if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
  ;(window as unknown as { __store: typeof useAppStore }).__store = useAppStore
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
