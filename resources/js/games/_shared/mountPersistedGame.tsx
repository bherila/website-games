import { type ReactElement, StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { type GameDataDefinition, initializeGameDataPersistence } from './gameDataPersistence'

export function mountPersistedGame(
  mountId: string,
  renderGame: () => ReactElement,
  definitions: readonly GameDataDefinition[],
): void {
  const mount = document.getElementById(mountId)
  if (!mount) {
    return
  }

  const root = createRoot(mount)
  root.render(<div role="status">Loading saved game…</div>)

  void initializeGameDataPersistence(definitions)
    .then(() => {
      root.render(
        <StrictMode>
          <PersistedGameRoot renderGame={renderGame} />
        </StrictMode>,
      )
    })
    .catch((error: unknown) => {
      console.error('Unable to load saved game data.', error)
      root.render(
        <div role="alert">
          <p>Saved game data could not be loaded. Reload the page to try again.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload</button>
        </div>,
      )
    })
}

interface PersistedGameRootProps {
  renderGame: () => ReactElement
}

function PersistedGameRoot({ renderGame }: PersistedGameRootProps): ReactElement {
  const [hasConflict, setHasConflict] = useState(false)

  useEffect(() => {
    const handleConflict = (): void => setHasConflict(true)
    window.addEventListener('game-data-conflict', handleConflict)

    return () => window.removeEventListener('game-data-conflict', handleConflict)
  }, [])

  return (
    <>
      {hasConflict && (
        <div className="fixed inset-x-3 top-3 z-[10000] rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950 shadow-lg dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100" role="alert">
          This game is active in another tab or device. This tab stopped saving its active game to protect the newer save. Reload to continue from the latest save.
        </div>
      )}
      {renderGame()}
    </>
  )
}
