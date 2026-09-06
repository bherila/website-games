/**
 * Small DOM building blocks with the game's warm palette. Everything here is
 * plain HTML with visible focus rings and ≥44px touch targets.
 */
import type { ComponentProps, ReactElement, ReactNode } from 'react'

import { cn } from '@/lib/utils'

export const INK = 'text-[#2f3a44]'
export const MUTED = 'text-[#5b6470]'

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'choice'
type Size = 'md' | 'lg'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-[#5d8a70] text-white hover:bg-[#4f7a62] active:bg-[#476f59] border-transparent',
  secondary: 'bg-white text-[#2f3a44] border-[#cfd6d1] hover:bg-[#f2f5f2] active:bg-[#e7ece8]',
  quiet: 'bg-transparent text-[#3f5169] border-transparent hover:bg-[#e8eef2] active:bg-[#dbe4ea]',
  danger: 'bg-white text-[#9b3a3a] border-[#e0bcbc] hover:bg-[#fbf1f1]',
  choice: 'bg-white text-[#2f3a44] border-[#cfd6d1] hover:border-[#5d8a70] hover:bg-[#f4f8f5] text-left justify-start',
}
const SIZE: Record<Size, string> = {
  md: 'min-h-11 px-4 text-[15px]',
  lg: 'min-h-14 px-6 text-base sm:text-lg',
}

interface GameButtonProps extends ComponentProps<'button'> {
  variant?: Variant
  size?: Size
  block?: boolean
}

export function GameButton({ variant = 'secondary', size = 'md', block = false, className, type = 'button', ...props }: GameButtonProps): ReactElement {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl border font-semibold leading-tight transition-colors',
        'outline-none focus-visible:ring-4 focus-visible:ring-[#d9a441]/60 disabled:cursor-not-allowed disabled:opacity-45',
        VARIANT[variant],
        SIZE[size],
        block && 'w-full',
        className,
      )}
      {...props}
    />
  )
}

export function Panel({ children, className, as: Tag = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & Record<string, unknown>): ReactElement {
  return (
    <Tag className={cn('rounded-2xl border border-[#e2dccd] bg-white/95 p-4 shadow-[0_1px_2px_rgba(47,58,68,0.06)] sm:p-5', className)} {...rest}>
      {children}
    </Tag>
  )
}

export function Chip({ children, tone = 'neutral', className, ...rest }: { children: ReactNode; tone?: 'neutral' | 'jade' | 'amber' | 'slate' | 'rose'; className?: string } & Omit<ComponentProps<'span'>, 'children' | 'className'>): ReactElement {
  const tones = {
    neutral: 'bg-[#eef0ec] text-[#3f4a54] border-[#d9ddd6]',
    jade: 'bg-[#e4efe8] text-[#2f5d45] border-[#bfd8c9]',
    amber: 'bg-[#fbf1da] text-[#7a5a14] border-[#ead7a4]',
    slate: 'bg-[#e6ecf2] text-[#33465c] border-[#c5d2de]',
    rose: 'bg-[#fbeaea] text-[#8a3232] border-[#efc4c4]',
  }
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)} {...rest}>{children}</span>
}

/** Chinese + pinyin + English block. `hide` keeps the row but replaces text with an honest placeholder. */
export function SpokenText({ zh, pinyin, en, showPinyin = true, size = 'lg', className }: { zh: string; pinyin: string; en: string; showPinyin?: boolean; size?: 'md' | 'lg' | 'xl'; className?: string }): ReactElement {
  const zhSize = size === 'xl' ? 'text-3xl sm:text-4xl' : size === 'lg' ? 'text-2xl sm:text-3xl' : 'text-xl'
  return (
    <div className={cn('space-y-0.5', className)}>
      <p lang="zh-Hans" className={cn('font-medium leading-snug tracking-wide', zhSize, INK)}>{zh}</p>
      {showPinyin && <p lang="zh-Latn-pinyin" className={cn('text-sm sm:text-base', MUTED)}>{pinyin}</p>}
      <p className={cn('text-sm sm:text-base', INK)}>{en}</p>
    </div>
  )
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }): ReactElement {
  return <h2 className={cn('text-lg font-bold tracking-tight sm:text-xl', INK, className)}>{children}</h2>
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }): ReactElement {
  return <p className={cn('text-[11px] font-bold uppercase tracking-[0.14em] text-[#6d7a86]', className)}>{children}</p>
}

export function VisuallyHidden({ children }: { children: ReactNode }): ReactElement {
  return <span className="sr-only">{children}</span>
}
