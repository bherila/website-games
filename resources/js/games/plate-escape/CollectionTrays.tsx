import { Check, ChevronRight, LockKeyhole, Plus } from 'lucide-react'
import { type CSSProperties, type ReactElement, useId } from 'react'

import { type PuzzleState, rackOpen, spareCapacity, type Tray } from './engine'
import { COLORS, getLevel, type ScrewColor } from './level'
import { markPath, rackMarkPath } from './screwMarks'

const SOCKETS = [[80, 31], [38, 85], [122, 85]] as const
const TRIANGLE = 'M72 10Q80-4 88 10L152 98Q161 112 145 112H15Q-1 112 8 98Z'
const INVERTED_TRIANGLE = 'M72 110Q80 124 88 110L152 22Q161 8 145 8H15Q-1 8 8 22Z'

export function ScrewHead({ color, size = 28, x, y }: { color: ScrewColor, size?: number, x?: number, y?: number }): ReactElement {
  return (
    <svg aria-hidden="true" width={size} height={size} x={x} y={y} viewBox="0 0 40 40" className="shrink-0">
      <circle cx="20" cy="20" r="19" fill="#f3e6cf" />
      {/* A faint edge keeps a pale head distinct from its cream rim. */}
      <circle cx="20" cy="20" r="16" fill={COLORS[color].hex} stroke="#263747" strokeOpacity=".22" strokeWidth="1" />
      <path d="M8 17A13 13 0 0 1 30 10" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="2" strokeLinecap="round" />
      <path d={markPath(color, 20, 20, 14)} fill="#263747" data-mark={color} />
    </svg>
  )
}

function ColorTray({ tray, inverted }: { tray: Tray, inverted: boolean }): ReactElement {
  const maskId = useId()
  const holeId = useId()
  const color = tray.color
  const fill = color ? COLORS[color].hex : 'var(--plate-tray-empty)'
  const outline = inverted ? INVERTED_TRIANGLE : TRIANGLE
  const sockets = SOCKETS.map(([x, y]) => [x, inverted ? 120 - y : y])
  return (
    <div data-tray-color={color ?? ''} data-tray-orientation={inverted ? 'down' : 'up'} role="img" aria-label={color ? `${COLORS[color].name} tray: ${tray.count} of 3` : 'Tray complete'} className="plate-color-tray">
      <svg aria-hidden="true" viewBox="0 0 160 120" className="h-full w-full overflow-visible">
        <defs>
          <mask id={maskId}><path d={outline} fill="white" />{sockets.map(([x, y]) => <circle key={x} cx={x} cy={y} r="12" fill="black" />)}</mask>
          <radialGradient id={holeId} cx="50%" cy="70%" r="70%">
            <stop offset="0" stopColor="#243d43" />
            <stop offset=".65" stopColor="#152b32" />
            <stop offset="1" stopColor="#06171d" />
          </radialGradient>
        </defs>
        <path d={outline} transform="translate(0 4)" fill="#263747" opacity=".22" />
        <path d={outline} fill={fill} mask={`url(#${maskId})`} stroke="#263747" strokeOpacity=".18" strokeWidth="2" data-tray-face="" />
        <path d={inverted ? 'M17 13H143' : 'M75 12Q80 3 85 12L147 99'} fill="none" stroke="#fff" strokeOpacity=".38" strokeWidth="3" strokeLinecap="round" />
        {sockets.map(([x, y], slot) => (
          <g key={x} data-tray-slot={slot} transform={`translate(${x} ${y})`}>
            <circle r="15" fill={fill} stroke="#142b32" strokeOpacity=".18" strokeWidth="2" />
            <circle r="12" fill={`url(#${holeId})`} data-screw-hole="" />
            <path d="M-11 3A12 12 0 0 0 11 3" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="2" />
            <path d="M-8-5A10 10 0 0 1 8-5" fill="none" stroke="#000" strokeOpacity=".4" strokeWidth="2" />
            {color && slot < tray.count ? <ScrewHead color={color} size={34} x={-17} y={-17} /> : null}
          </g>
        ))}
        {/* The color's mark stays stamped on the tray, so an empty tray matches by shape too. */}
        {color && <path d={markPath(color, 80, inverted ? 54 : 66, 11)} fill="#263747" fillOpacity=".55" data-tray-emblem={color} />}
        {color === null && <path d="M72 62L79 69L91 55" fill="none" stroke="#52796b" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
    </div>
  )
}

/** The staging rack's peg-rail mark, as painted on the rack's cover. */
export function RackMark({ size = 18 }: { size?: number }): ReactElement {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 40 40" className="shrink-0"><path d={rackMarkPath(20, 20, 17)} fill="currentColor" data-rack-mark="" /></svg>
}

/** Matching uses the same colored screw faces in trays, the queue and spare storage. */
export function CollectionTrays({ state }: { state: PuzzleState }): ReactElement {
  const level = getLevel(state.level)
  return (
    <section aria-label="Collection trays" className="mx-4 rounded-3xl border border-white/80 bg-white/75 px-3 py-2 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
      <div className="flex items-center justify-between gap-2">
        <div role="group" className="flex items-center gap-1" aria-label={`Upcoming trays: ${state.queue.length ? state.queue.map((color) => COLORS[color].name).join(', ') : 'none'}`}>
          <ChevronRight size={16} className="text-slate-400 dark:text-slate-500" aria-hidden="true" />
          {state.queue.length ? state.queue.map((color) => <ScrewHead key={color} color={color} size={23} />) : <Check size={20} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />}
        </div>
        <span className="text-[10px] font-bold tabular-nums text-slate-500 dark:text-slate-400">{state.completed.length} / {level.trayColors.length} collected</span>
      </div>
      <div className="plate-tray-row" style={{ '--tray-count': state.trays.length } as CSSProperties}>
        {state.trays.map((tray, index) => <ColorTray key={tray.id} tray={tray} inverted={index % 2 === 1} />)}
      </div>
      <div role="group" data-spare-slots className="flex items-center justify-center gap-2" aria-label={`Spare storage: ${state.spare.length} of ${spareCapacity(state)}`}>
        {Array.from({ length: level.spareCapacity }, (_, slot) => <SpareSlot key={slot} slot={slot} color={state.spare[slot]} />)}
        {/* The staging rack's slot is shown from the start, locked under the rack's mark until the rack is freed. */}
        {level.rack && <SpareSlot slot={level.spareCapacity} color={state.spare[level.spareCapacity]} rack={rackOpen(state) ? 'open' : 'locked'} />}
      </div>
    </section>
  )
}

function SpareSlot({ slot, color, rack }: { slot: number, color: ScrewColor | undefined, rack?: 'open' | 'locked' }): ReactElement {
  const ring = rack ? 'border-orange-400 bg-orange-50/80 dark:border-orange-400/70 dark:bg-orange-950/40' : 'border-slate-300 bg-slate-100/70 dark:border-slate-600 dark:bg-slate-800/70'
  if (rack === 'locked') {
    return (
      <span data-spare-slot={slot} data-rack-slot="locked" role="img" aria-label={`Spare slot ${slot + 1} locked: free the staging rack to open it`} className={`relative grid h-7 w-7 place-items-center rounded-full border ${ring} text-orange-700 dark:text-orange-300`}>
        <RackMark size={18} />
        <span aria-hidden="true" className="absolute -bottom-1 -right-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-white text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300"><LockKeyhole size={9} strokeWidth={2.5} /></span>
      </span>
    )
  }
  const name = color ? `${COLORS[color].name} screw in spare slot ${slot + 1}` : `Spare slot ${slot + 1} empty`
  return (
    <span data-spare-slot={slot} {...(rack ? { 'data-rack-slot': rack } : {})} role="img" aria-label={rack ? `${name}, on the staging rack` : name} className={`relative grid h-7 w-7 place-items-center rounded-full border border-dashed ${ring}`}>
      {color ? <ScrewHead color={color} size={28} /> : <Plus size={12} className={rack ? 'text-orange-400 dark:text-orange-400/70' : 'text-slate-300 dark:text-slate-600'} aria-hidden="true" />}
      {rack && <span aria-hidden="true" className="absolute -bottom-1 -right-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-white text-orange-700 shadow-sm dark:bg-slate-900 dark:text-orange-300"><RackMark size={11} /></span>}
    </span>
  )
}
