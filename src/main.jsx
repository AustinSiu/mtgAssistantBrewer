import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applyColorTokens } from './designTokens.js'

// Sync the JS-sourced color tokens (MTG identity + sub-deck accents) onto the
// document root so CSS can reference them via var(); see designTokens.js.
applyColorTokens()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
