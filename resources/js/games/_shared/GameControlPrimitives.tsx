import { Accessibility } from 'lucide-react'
import { type ComponentProps, type ReactElement, type ReactNode } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface PowerUpConfirmation {
  actionLabel: string
  description: string
  title: string
}

interface ColorblindToggleProps {
  checked: boolean
  id: string
  onCheckedChange: (enabled: boolean) => void
  className?: string
}

export function ColorblindToggle({ checked, className, id, onCheckedChange }: ColorblindToggleProps): ReactElement {
  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-white/60 px-2.5 py-1.5 shadow-xs dark:border-white/10 dark:bg-white/5', className)}>
      <Label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200" htmlFor={id}>
        <Accessibility aria-hidden="true" className="size-4 text-slate-500 dark:text-slate-400" />
        Colorblind mode
      </Label>
      <Switch aria-label="Colorblind mode" checked={checked} id={id} onCheckedChange={onCheckedChange} />
    </div>
  )
}

interface MetricProps {
  label: string
  value: string
  className?: string
  emphasis?: boolean
}

export function Metric({ className, emphasis = false, label, value }: MetricProps): ReactElement {
  return (
    <div className={cn('min-w-16 rounded-lg border border-slate-200/70 bg-white/55 px-2.5 py-1.5 shadow-xs dark:border-white/10 dark:bg-white/5', className)}>
      <div className="text-[10px] font-bold uppercase leading-none text-slate-500 dark:text-slate-400">{label}</div>
      <div className={cn('mt-1 font-black leading-none tabular-nums text-slate-950 dark:text-slate-50', emphasis ? 'text-2xl' : 'text-base')}>{value}</div>
    </div>
  )
}

interface BottomControlButtonProps {
  disabled: boolean
  icon: ReactNode
  label: string
  onClick: () => void
  accentClassName?: string
  active?: boolean
  confirmation?: PowerUpConfirmation | undefined
  count?: number
  variant?: ComponentProps<typeof Button>['variant']
}

export function BottomControlButton({
  accentClassName,
  active = false,
  confirmation,
  count,
  disabled,
  icon,
  label,
  onClick,
  variant = 'outline',
}: BottomControlButtonProps): ReactElement {
  const button = (
    <Button
      aria-label={label}
      aria-pressed={active ? true : undefined}
      className={cn(
        'relative size-12 min-w-0 rounded-2xl border-slate-200 bg-white/90 p-0 text-slate-800 shadow-md shadow-slate-950/10 transition-transform hover:-translate-y-0.5 hover:bg-white active:scale-95 disabled:opacity-40 sm:size-14 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15 [&_svg]:size-5 sm:[&_svg]:size-6',
        accentClassName,
        active && 'border-amber-300 bg-amber-300 text-amber-950 shadow-amber-950/15 ring-2 ring-amber-200 dark:border-amber-300 dark:bg-amber-300 dark:text-amber-950 dark:ring-amber-200/50',
      )}
      disabled={disabled}
      type="button"
      variant={variant}
      onClick={confirmation ? undefined : onClick}
    >
      {icon}
      {count !== undefined && (
        <span className="absolute -right-1.5 -top-1.5 flex min-w-6 items-center justify-center rounded-full border-2 border-white bg-rose-600 px-1 text-xs font-black leading-5 text-white shadow-sm dark:border-slate-950">
          {count}
        </span>
      )}
    </Button>
  )
  const trigger = (
    <span className="flex min-w-0" tabIndex={disabled ? 0 : undefined}>
      {confirmation ? <AlertDialogTrigger asChild>{button}</AlertDialogTrigger> : button}
    </span>
  )

  if (!confirmation) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>{label}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <AlertDialog>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>{label}</TooltipContent>
      </Tooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmation.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirmation.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onClick}>{confirmation.actionLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface GameBottomToolbarProps {
  children: ReactNode
}

export function GameBottomToolbar({ children }: GameBottomToolbarProps): ReactElement {
  return (
    <div className="pointer-events-none absolute inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-20 flex justify-center sm:bottom-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div
        aria-label="Game controls"
        className="pointer-events-auto flex items-center gap-1.5 rounded-3xl border border-white/70 bg-white/85 p-1.5 shadow-xl shadow-slate-950/20 backdrop-blur-md sm:gap-2 sm:p-2 dark:border-white/10 dark:bg-slate-950/80"
        data-game-bottom-toolbar="true"
        role="toolbar"
      >
        {children}
      </div>
    </div>
  )
}

export const GAME_TOOLBAR_PADDING_CLASS = 'pb-[4.5rem] sm:pb-24'
export const GAME_TOOLBAR_RESERVED_HEIGHT_PX = { mobile: 72, desktop: 96 } as const

export function gameToolbarReservedHeightPx(desktop: boolean): number {
  return desktop ? GAME_TOOLBAR_RESERVED_HEIGHT_PX.desktop : GAME_TOOLBAR_RESERVED_HEIGHT_PX.mobile
}
