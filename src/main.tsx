import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { StoreProvider } from './state.tsx'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('Élément #root introuvable')

createRoot(container).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
)
