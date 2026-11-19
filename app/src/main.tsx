import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './ui/theme.css'

// Bitte den Browser, den lokalen Speicher nicht von sich aus zu räumen (kann fehlen oder abgelehnt werden).
void navigator.storage?.persist?.()?.catch(() => undefined)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
