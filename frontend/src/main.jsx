/**
 * Browser entry point.
 *
 * Creates the React root on `#root` (see index.html), enables StrictMode for extra
 * development checks, loads global styles first, then renders `<App />`.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
