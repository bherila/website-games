import '../../../css/app.css'

import { createRoot } from 'react-dom/client'

import { MandarinGame } from './MandarinGame'
import { createPreviewRuntime } from './runtime/previewRuntime'

const root = document.getElementById('mandarin-game-root')
if (root) {
  const runtime = createPreviewRuntime()
  createRoot(root).render(<MandarinGame runtime={runtime} />)
}
