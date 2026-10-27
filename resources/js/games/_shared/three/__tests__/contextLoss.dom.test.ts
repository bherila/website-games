import { attachContextLossHandlers } from '../contextLoss'

function loseContext(canvas: HTMLCanvasElement): Event {
  const event = new Event('webglcontextlost', { cancelable: true })
  canvas.dispatchEvent(event)
  return event
}

function restoreContext(canvas: HTMLCanvasElement): void {
  canvas.dispatchEvent(new Event('webglcontextrestored'))
}

describe('attachContextLossHandlers', () => {
  it('preventDefaults the lost event and pauses via the onLost callback', () => {
    const canvas = document.createElement('canvas')
    const onLost = jest.fn()
    const onRestored = jest.fn()
    attachContextLossHandlers(canvas, { onLost, onRestored })

    const event = loseContext(canvas)

    expect(event.defaultPrevented).toBe(true) // required or the browser never restores
    expect(onLost).toHaveBeenCalledTimes(1)
    expect(onRestored).not.toHaveBeenCalled()
  })

  it('fires the rebuild/resume callback on webglcontextrestored', () => {
    const canvas = document.createElement('canvas')
    const onRestored = jest.fn()
    attachContextLossHandlers(canvas, { onLost: jest.fn(), onRestored })

    restoreContext(canvas)

    expect(onRestored).toHaveBeenCalledTimes(1)
  })

  it('detaches both listeners on cleanup', () => {
    const canvas = document.createElement('canvas')
    const onLost = jest.fn()
    const onRestored = jest.fn()
    const detach = attachContextLossHandlers(canvas, { onLost, onRestored })

    detach()
    loseContext(canvas)
    restoreContext(canvas)

    expect(onLost).not.toHaveBeenCalled()
    expect(onRestored).not.toHaveBeenCalled()
  })
})
