import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

import { MARBLE_KINDS, type MarbleKind } from '../physics/marbles'

const CHIP_STYLES: Readonly<Record<MarbleKind, string>> = {
  glass: 'size-3.5 bg-[radial-gradient(circle_at_35%_30%,#ffffff_0%,#bae6fd_45%,#38bdf8_100%)] ring-sky-500/40',
  mini: 'size-2.5 bg-[radial-gradient(circle_at_35%_30%,#ffffff_0%,#a7f3d0_45%,#10b981_100%)] ring-emerald-600/40',
  steel: 'size-3.5 bg-[radial-gradient(circle_at_35%_30%,#ffffff_0%,#cbd5e1_40%,#475569_100%)] ring-slate-600/40',
}

/** A small marble swatch: size and colour match the marble kind. */
export function MarbleChip({ kind, className }: { kind: MarbleKind; className?: string }): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block shrink-0 rounded-full shadow-sm ring-1', CHIP_STYLES[kind], className)}
      data-marble-kind={kind}
      title={MARBLE_KINDS[kind].label}
    />
  )
}
