import '../../../css/app.css'

import { createRoot } from 'react-dom/client'

import { MandarinGame } from './MandarinGame'
import { createLiveRuntime } from './runtime/liveRuntime'
import { createPreviewRuntime } from './runtime/previewRuntime'
import { renderLoadError } from './ui/renderLoadError'

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
      (error: unknown) => renderLoadError(root, error),
    )
  }
}
