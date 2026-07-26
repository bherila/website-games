import { Star } from 'lucide-react'
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

/** Large three-star row for level-complete overlays. */
export function StarRow({ stars }: { stars: number }): ReactElement {
  return (
    <div aria-label={`${stars} of 3 stars`} className="mb-3 flex items-center justify-center gap-1.5" role="img">
      {([0, 1, 2] as const).map((starIndex) => (
        <Star
          aria-hidden="true"
          className={cn(
            'size-8 drop-shadow-sm',
            starIndex < stars ? 'fill-amber-400 text-amber-500' : 'fill-slate-200 text-slate-300 dark:fill-slate-800 dark:text-slate-700',
            starIndex === 1 && 'size-10 -translate-y-1',
          )}
          key={starIndex}
        />
      ))}
    </div>
  )
}
