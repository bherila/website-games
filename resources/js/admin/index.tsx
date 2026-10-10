import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AdminPage } from './AdminPage'
import { httpAudioApi } from './audioApi'
import type { PanelData } from './types'

const root = document.getElementById('admin-root')
const data = document.getElementById('admin-panel-data')
if (root !== null && data !== null) {
  const panel = JSON.parse(data.textContent ?? '{}') as PanelData
  createRoot(root).render(
    <StrictMode>
      <AdminPage api={httpAudioApi(panel.audio)} panel={panel} />
    </StrictMode>,
  )
}
