import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

import type { ElementId, HeroUpgrade, TowerId } from '../gameTypes'
import arrow from './icons/arrow.webp'
import boots from './icons/boots.webp'
import boulder from './icons/boulder.webp'
import dark from './icons/dark.webp'
import earth from './icons/earth.webp'
import ember from './icons/ember.webp'
import fire from './icons/fire.webp'
import frost from './icons/frost.webp'
import hex from './icons/hex.webp'
import light from './icons/light.webp'
import magnet from './icons/magnet.webp'
import nature from './icons/nature.webp'
import sun from './icons/sun.webp'
import thorn from './icons/thorn.webp'
import wall from './icons/wall.webp'
import water from './icons/water.webp'

const ICONS: Record<TowerId | ElementId | HeroUpgrade, string> = {
  arrow, boots, boulder, dark, earth, ember, fire, frost, hex, light, magnet, nature, sun, thorn, wall, water,
}

/** A decorative picture: the text or label beside it always names the same thing. */
export function GameIcon({ name, className }: { name: keyof typeof ICONS; className?: string }): ReactElement {
  return <img alt="" aria-hidden="true" className={cn('shrink-0 select-none object-contain', className)} data-icon={name} decoding="async" draggable={false} src={ICONS[name]} />
}

/** For an icon sitting in a line of text. */
export const INLINE_ICON = 'mr-0.5 inline-block size-[1.25em] align-[-0.3em]'
