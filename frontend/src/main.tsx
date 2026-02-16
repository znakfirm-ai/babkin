import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    event.preventDefault()
    console.error("Unhandled promise rejection:", event.reason)
  })
  window.addEventListener("error", (event) => {
    console.error("Unhandled error:", event.error || event.message)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
