import * as THREE from 'three'

const LABEL_REDRAW_INTERVAL = 0.08

export interface LabelStyle {
  color: string
  glow: string
  background?: string
  fontPx?: number
}

/**
 * A sprite label backed by a single reused canvas + texture. Text changes are
 * throttled so rapidly ticking counts (volleys land every 0.18s) never
 * allocate new textures or redraw more than ~12 times per second.
 */
export class CanvasLabel {
  readonly sprite: THREE.Sprite

  private readonly canvas: HTMLCanvasElement
  private readonly texture: THREE.CanvasTexture
  private readonly style: LabelStyle
  private current = ''
  private pending: string | null = null
  private cooldown = 0

  constructor(style: LabelStyle) {
    this.style = style
    this.canvas = document.createElement('canvas')
    this.canvas.width = 256
    this.canvas.height = 128
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthTest: false }))
    this.sprite.renderOrder = 10
  }

  setText(text: string): void {
    this.pending = text === this.current ? null : text
  }

  tick(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt)
    if (this.pending === null || this.cooldown > 0) {
      return
    }
    this.draw(this.pending)
    this.current = this.pending
    this.pending = null
    this.cooldown = LABEL_REDRAW_INTERVAL
  }

  /** Redraws immediately, bypassing the throttle (for one-off text like gate ops). */
  setTextNow(text: string): void {
    if (text === this.current && this.pending === null) {
      return
    }
    this.redraw(text)
  }

  /** Mutates the label style; takes effect on the next redraw. */
  setStyle(style: Partial<LabelStyle>): void {
    Object.assign(this.style, style)
  }

  /** Unconditional immediate redraw — use after a style change, where the text may be unchanged. */
  redraw(text: string): void {
    this.draw(text)
    this.current = text
    this.pending = null
    this.cooldown = LABEL_REDRAW_INTERVAL
  }

  private draw(text: string): void {
    const context = this.canvas.getContext('2d')
    if (!context) {
      return
    }
    context.clearRect(0, 0, 256, 128)
    if (this.style.background) {
      context.fillStyle = this.style.background
      context.beginPath()
      context.roundRect(6, 10, 244, 108, 26)
      context.fill()
    }
    const fontPx = this.style.fontPx ?? 84
    context.font = `900 ${fontPx}px system-ui, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.shadowColor = this.style.glow
    context.shadowBlur = 18
    context.lineWidth = 10
    context.strokeStyle = '#050816'
    context.strokeText(text, 128, 68)
    context.shadowBlur = 0
    context.fillStyle = this.style.color
    context.fillText(text, 128, 68)
    this.texture.needsUpdate = true
  }
}

export interface LabelPool {
  /** Borrow the label at `index`, creating it lazily. */
  borrow(index: number): CanvasLabel
  hideFrom(index: number): void
  tick(dt: number): void
}

export function createLabelPool(scene: THREE.Scene, size: number, style: LabelStyle): LabelPool {
  const labels: CanvasLabel[] = []

  function ensure(index: number): CanvasLabel {
    while (labels.length <= index) {
      const label = new CanvasLabel(style)
      label.sprite.visible = false
      scene.add(label.sprite)
      labels.push(label)
    }

    return labels[index]!
  }

  return {
    borrow(index: number): CanvasLabel {
      const label = ensure(Math.min(index, size - 1))
      label.sprite.visible = true

      return label
    },
    hideFrom(index: number): void {
      for (let i = index; i < labels.length; i += 1) {
        labels[i]!.sprite.visible = false
      }
    },
    tick(dt: number): void {
      for (const label of labels) {
        if (label.sprite.visible) {
          label.tick(dt)
        }
      }
    },
  }
}
