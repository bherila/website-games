import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { TowerGame } from './TowerGame'

const mount = document.getElementById('tower-game-root')

if (mount) {
  createRoot(mount).render(
    <StrictMode>
      <TowerGame />
    </StrictMode>,
  )
}
