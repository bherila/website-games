import type { ReactElement } from 'react'

interface FlagRowProps {
  label: string
  collected: number
  total: number
  team: 'blue' | 'red'
}

function FlagRow({ label, collected, total, team }: FlagRowProps): ReactElement {
  const filled = team === 'blue' ? 'bg-blue-400 border-blue-200' : 'bg-red-400 border-red-200'
  const empty = 'bg-transparent border-white/40'

  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-right text-[10px] font-bold tracking-widest text-white/70">{label}</span>
      <div className="flex items-center gap-1">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            data-testid={`flag-dot-${team}`}
            data-filled={index < collected}
            className={`inline-block size-2.5 rounded-full border ${index < collected ? filled : empty}`}
          />
        ))}
      </div>
      <span className="text-xs font-semibold tabular-nums text-white/90">
        {collected}/{total}
      </span>
    </div>
  )
}

interface FlagStatusProps {
  blueCollected: number
  blueTotal: number
  redCollected: number
  redTotal: number
}

/** Blue = your flags, red = the drone's. Dots fill as flags are captured. */
export function FlagStatus({ blueCollected, blueTotal, redCollected, redTotal }: FlagStatusProps): ReactElement {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-slate-950/60 px-3 py-2 backdrop-blur-sm">
      <FlagRow label="YOU" collected={blueCollected} total={blueTotal} team="blue" />
      <FlagRow label="DRONE" collected={redCollected} total={redTotal} team="red" />
    </div>
  )
}
