import '../../../css/app.css'

import { createRoot } from 'react-dom/client'

import { MandarinGame } from './MandarinGame'
import { createLiveRuntime } from './runtime/liveRuntime'
import { createPreviewRuntime } from './runtime/previewRuntime'

/**
 * The Blade shell stamps `data-runtime` from server config. Only an explicit
 * `preview` value mounts the mock runtime (and honours `?scenario=`); anything
 * else is live, so production cannot be switched to mocks from the URL.
 */
const root = document.getElementById('mandarin-game-root')
if (root) {
  const reactRoot = createRoot(root)
  if (root.dataset.runtime === 'preview') {
    reactRoot.render(<MandarinGame runtime={createPreviewRuntime()} />)
  } else {
    createLiveRuntime().then(
      (runtime) => reactRoot.render(<MandarinGame runtime={runtime} />),
      (error: unknown) => {
        root.innerHTML = ''
        const message = document.createElement('p')
        message.setAttribute('role', 'alert')
        message.className = 'p-4 text-sm'
        message.textContent = `Could not load the course. ${error instanceof Error ? error.message : ''} Reload to try again.`
        root.appendChild(message)
      },
    )
  }
}
