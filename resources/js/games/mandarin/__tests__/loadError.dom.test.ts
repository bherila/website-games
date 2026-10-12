import { fireEvent, within } from '@testing-library/dom'

import { CourseUpdateRequiredError } from '../adapters/HttpMandarinGateway'
import { renderLoadError } from '../ui/renderLoadError'

describe('course load recovery', () => {
  it('offers a reload when this client cannot read a newer course', () => {
    const root = document.createElement('div')
    root.textContent = 'Loading…'
    const reload = jest.fn()
    renderLoadError(root, new CourseUpdateRequiredError(), reload)
    expect(within(root).getByRole('alert')).toHaveTextContent('A course update is available')
    fireEvent.click(within(root).getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledTimes(1)
    expect(root).not.toHaveTextContent('Loading…')
  })

  it('keeps internal errors out of the player-facing message', () => {
    const root = document.createElement('div')
    renderLoadError(root, new Error('schema internals or private response data'))
    expect(within(root).getByRole('alert')).toHaveTextContent('Check your connection')
    expect(root).not.toHaveTextContent('private response data')
  })
})
