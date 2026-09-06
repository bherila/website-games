import { type CSSProperties, type ReactElement, useState } from 'react'

import { cn } from '@/lib/utils'

import { type VisualSlot, visualSlot,type VisualSlotId } from './visualRegistry'

interface SlotImageProps {
  slotId: VisualSlotId | string
  className?: string
  /** Override the registry alt (e.g. decorative → ''). */
  alt?: string
  style?: CSSProperties
  /** Object-fit; posters default to cover, portraits to contain. */
  fit?: 'cover' | 'contain'
  loading?: 'lazy' | 'eager'
}

function objectPosition(slot: VisualSlot): string {
  switch (slot.anchor) {
    case 'face': return '50% 20%'
    case 'bottom': return '50% 100%'
    default: return '50% 50%'
  }
}

/**
 * Renders a registry slot. If the (future) generated image fails to load the
 * element silently falls back to the authored SVG so a slot never renders
 * broken.
 */
export function SlotImage({ slotId, className, alt, style, fit, loading = 'lazy' }: SlotImageProps): ReactElement {
  const slot = visualSlot(slotId)
  const [src, setSrc] = useState(slot.src)
  const resolvedFit = fit ?? (slot.kind === 'portrait' ? 'contain' : 'cover')
  return (
    <img
      src={src}
      alt={alt ?? slot.alt}
      width={slot.width}
      height={slot.height}
      loading={loading}
      decoding="async"
      draggable={false}
      data-visual-slot={slot.id}
      data-visual-status={slot.status}
      className={cn('block h-full w-full select-none', resolvedFit === 'cover' ? 'object-cover' : 'object-contain', className)}
      style={{ objectPosition: objectPosition(slot), ...style }}
      onError={() => {
        if (src !== slot.fallbackSrc) setSrc(slot.fallbackSrc)
      }}
    />
  )
}
