import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AppLauncher from './AppLauncher.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppLauncher />
  </StrictMode>,
)
