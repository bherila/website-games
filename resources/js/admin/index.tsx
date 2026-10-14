import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AdminPage, type AdminPageProps } from './AdminPage'

const root = document.getElementById('admin-root')
const data = document.getElementById('admin-panel-data')
if (root !== null && data !== null) {
  const panel = JSON.parse(data.textContent ?? '{}') as AdminPageProps['panel']
  createRoot(root).render(
    <StrictMode>
      <AdminPage panel={panel} />
    </StrictMode>,
  )
}
