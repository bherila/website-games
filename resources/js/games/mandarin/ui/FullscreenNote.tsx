/**
 * What "full screen" means on the device in hand, which differs enough between
 * platforms that a single button would mislead two thirds of players.
 *
 * Safari on iPhone implements no Element Fullscreen API, so no web page can
 * hide the address bar there — the only route is Add to Home Screen, which the
 * games PWA (`display: standalone`) already supports. Android and desktop get
 * the real API, and the installed app is chrome-less already and needs neither.
 */
import { Maximize, Minimize, Share } from 'lucide-react'
import { type ReactElement, useState } from 'react'

import { cn } from '@/lib/utils'

import { isFullscreenSupported, isStandaloneDisplayMode } from '../../_shared/fullscreen'
import { useFullscreen } from '../../_shared/useFullscreen'
import { GameButton, MUTED, SectionTitle } from './primitives'

/** Only tailors the wording. Whether to offer installing is decided by capability. */
function looksLikeIos(nav: Navigator = navigator): boolean {
  return /iPad|iPhone|iPod/.test(nav.userAgent)
}

type Mode = 'standalone' | 'api' | 'install-ios' | 'install'

export function FullscreenNote(): ReactElement {
  const fullscreen = useFullscreen()
  const [mode] = useState<Mode>(() => {
    if (isStandaloneDisplayMode()) return 'standalone'
    if (isFullscreenSupported()) return 'api'
    // No fullscreen API and not installed: installing is the only way left to
    // lose the address bar, whatever the browser claims to be. Deciding that on
    // capability rather than on the user agent keeps a device whose UA we do
    // not recognise from landing on a dead end.
    return looksLikeIos() ? 'install-ios' : 'install'
  })

  return (
    <div className="flex flex-col gap-2" data-testid="fullscreen-note" data-fullscreen-mode={mode}>
      <SectionTitle>Full screen</SectionTitle>
      {mode === 'standalone' && (
        <p className="text-sm">You are playing from your home screen, so there is no address bar taking up space. Nothing to change here.</p>
      )}
      {mode === 'api' && (
        <>
          <p className="text-sm">Hides the browser bars so the scene and the answers get the whole screen.</p>
          <GameButton
            variant="secondary"
            // The panel is a flex column, which would otherwise stretch this
            // across the full width of a desktop settings page.
            className="self-start"
            onClick={fullscreen.toggle}
            aria-pressed={fullscreen.active}
            data-testid="fullscreen-note-toggle"
          >
            {fullscreen.active
              ? <><Minimize aria-hidden="true" className="size-4" />Leave full screen</>
              : <><Maximize aria-hidden="true" className="size-4" />Go full screen</>}
          </GameButton>
          <p className={cn('text-sm', MUTED)}>The same control sits in the top bar while you play.</p>
        </>
      )}
      {(mode === 'install-ios' || mode === 'install') && (
        <>
          <p className="text-sm">
            {mode === 'install-ios'
              ? <>Safari on iPhone will not let a web page hide the address bar. To play without it, tap{' '}<Share aria-hidden="true" className="inline size-4 align-text-bottom" /> <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</>
              : <>This browser will not let a web page hide the address bar. To play without it, install Mandarin Quest to your home screen from the browser menu.</>}
          </p>
          {/* iOS gives an installed web app its own cookie and storage jar,
              separate from Safari's. Nothing carries across, so promising that
              it does would send a player looking for progress that is not
              there. Signed-in progress does come back — from the server. */}
          <p className={cn('text-sm', MUTED)}>Mandarin Quest then opens in its own window with no browser bars. It keeps its own separate storage, so you will need to sign in again there; progress saved to your account comes back when you do.</p>
        </>
      )}
    </div>
  )
}
