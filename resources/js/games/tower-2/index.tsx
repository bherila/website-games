import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { Tower2Game } from './Tower2Game'

const mount = document.getElementById('tower-2-root')

if (mount) {
  createRoot(mount).render(
    <StrictMode>
      <Tower2Game />
    </StrictMode>,
  )
}
