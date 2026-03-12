import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initDiagnosticsSession, logDiagnosticEvent } from "./utils/diagnostics"

if (typeof window !== "undefined") {
  initDiagnosticsSession()
  logDiagnosticEvent("bootstrap.start")
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
