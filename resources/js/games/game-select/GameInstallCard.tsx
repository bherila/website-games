import { Download, Share } from 'lucide-react'
import { type ReactElement, useEffect, useState } from 'react'

import type { BeforeInstallPromptEvent } from '../pwa/register'

export function GameInstallCard(): ReactElement | null {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => window.bwhGamesPwa?.installPrompt ?? null,
  )
  const [isInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches)
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)

  useEffect(() => {
    const handleInstallAvailability = (): void => {
      setInstallPrompt(window.bwhGamesPwa?.installPrompt ?? null)
    }
    window.addEventListener('bwh-games-install-available', handleInstallAvailability)

    return () => window.removeEventListener('bwh-games-install-available', handleInstallAvailability)
  }, [])

  if (isInstalled || (!installPrompt && !isIos)) {
    return null
  }

  const promptForInstall = async (): Promise<void> => {
    await installPrompt?.prompt()
    setInstallPrompt(null)
  }

  return (
    <aside className="mb-8 flex flex-col gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-950 shadow-sm dark:border-blue-900 dark:bg-blue-950 dark:text-blue-50 sm:flex-row sm:items-center sm:justify-between" aria-label="Install BWH Games">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-blue-600 p-2 text-white" aria-hidden="true">
          {isIos ? <Share className="size-5" /> : <Download className="size-5" />}
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="font-bold">Play from your home screen</h2>
          <p className="text-sm text-blue-800 dark:text-blue-200">
            {isIos
              ? 'In Safari, tap Share, then Add to Home Screen.'
              : 'Install BWH Games for quick access and offline play after visiting a game.'}
          </p>
        </div>
      </div>
      {installPrompt && (
        <button
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          onClick={() => void promptForInstall()}
          type="button"
        >
          <Download aria-hidden="true" className="size-4" />
          Install app
        </button>
      )}
    </aside>
  )
}
