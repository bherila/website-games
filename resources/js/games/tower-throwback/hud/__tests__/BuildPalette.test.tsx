import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { ITEM_DEFS, SHAFT_STAR_REQUIRED, shaftDef } from '../../engine/catalog'
import type { ItemKind, ShaftKind } from '../../gameTypes'
import { BuildPalette } from '../BuildPalette'

function openFamily(id: string): void {
  fireEvent.click(screen.getByTestId(`family-${id}`))
}

function searchFor(name: string): void {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search build tools' }), { target: { value: name } })
}

describe('BuildPalette', () => {
  it('renders a compact three-column grid without category tabs', () => {
    render(<BuildPalette maxStarReached={5} mapId="city-tower" selectedTool={null} onSelectTool={jest.fn()} />)

    expect(screen.getByTestId('build-tool-grid')).toHaveClass('grid-cols-3')
    expect(screen.getByTestId('build-tool-scroll-region')).toHaveClass('max-h-[calc(100dvh-5rem)]', 'overflow-y-auto')
    expect(screen.queryByTestId('category-office')).toBeNull()
    expect(screen.getByTestId('family-offices')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('family-offices')).not.toHaveAttribute('aria-haspopup')
    expect(screen.getByTestId('family-apartments')).toBeInTheDocument()
    expect(screen.getByTestId('family-hotel-rooms')).toBeInTheDocument()
  })

  it('star-gates variants and keeps their unlock requirements available', () => {
    render(<BuildPalette maxStarReached={1} mapId="city-tower" selectedTool={null} onSelectTool={jest.fn()} />)

    openFamily('offices')
    expect(screen.getByTestId('tool-officeS')).toBeEnabled()
    openFamily('offices')

    openFamily('hotel-rooms')
    expect(screen.getByTestId('tool-hotel1p')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByTestId('lock-hotel1p')).toHaveTextContent(`${ITEM_DEFS.hotel1p.starRequired}★`)
    expect(screen.getByTestId('unlock-reason-hotel1p')).toHaveTextContent(`Requires ★${ITEM_DEFS.hotel1p.starRequired}`)
    openFamily('hotel-rooms')

    expect(screen.getByTestId('tool-cathedral')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByTestId('lock-cathedral')).toHaveTextContent('5★')

    openFamily('elevators')
    expect(screen.getByTestId('tool-glass')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByTestId('lock-glass')).toHaveTextContent(`${SHAFT_STAR_REQUIRED.glass}★`)
    expect(screen.getByTestId('tool-standard')).toBeEnabled()
  })

  it('surfaces shaft semantics in an accessible family flyout', () => {
    render(<BuildPalette maxStarReached={4} mapId="city-tower" selectedTool={null} onSelectTool={jest.fn()} />)
    openFamily('elevators')

    expect(screen.getByRole('group', { name: 'Elevators variants' })).toBeInTheDocument()
    const standard = shaftDef('standard')
    expect(screen.getByTestId('summary-standard')).toHaveTextContent(`${standard.carCapacity} passengers/car`)
    expect(screen.getByTestId('summary-standard')).toHaveTextContent(`${standard.maxReachFloors} floors reach`)
    const express = shaftDef('express')
    expect(screen.getByTestId('summary-express')).toHaveTextContent(`${express.maxStops} stops max`)
    const service = shaftDef('service')
    expect(screen.getByTestId('summary-service')).toHaveTextContent(`${service.carCapacity} staff/trash/car`)

    fireEvent.focus(screen.getByTestId('tool-standard'))
    expect(screen.getByRole('group', { name: 'Elevators variants' })).toContainElement(screen.getByTestId('tool-details'))
  })

  it('renders an SVG icon for every searchable build tool', () => {
    render(<BuildPalette maxStarReached={5} mapId="city-tower" selectedTool={null} onSelectTool={jest.fn()} />)

    for (const kind of Object.keys(ITEM_DEFS) as ItemKind[]) {
      searchFor(ITEM_DEFS[kind].name)
      expect(screen.getByTestId(`tool-icon-${kind}`)).toHaveAttribute('src', expect.stringContaining('.svg'))
    }
    for (const kind of ['standard', 'express', 'service', 'glass'] as ShaftKind[]) {
      searchFor(shaftDef(kind).name)
      expect(screen.getByTestId(`tool-icon-${kind}`)).toHaveAttribute('src', expect.stringContaining('.svg'))
    }
  })

  it('selects singleton tools immediately and family variants after one flyout choice', () => {
    const onSelectTool = jest.fn()
    render(<BuildPalette maxStarReached={4} mapId="city-tower" selectedTool={null} onSelectTool={onSelectTool} />)

    fireEvent.click(screen.getByTestId('tool-slab'))
    expect(onSelectTool).toHaveBeenCalledWith({ kind: 'slab', isShaft: false })

    openFamily('elevators')
    fireEvent.click(screen.getByTestId('tool-glass'))
    expect(onSelectTool).toHaveBeenCalledWith({ kind: 'glass', isShaft: true })
    expect(screen.queryByRole('group', { name: 'Elevators variants' })).toBeNull()

    openFamily('offices')
    fireEvent.click(screen.getByTestId('tool-officeM'))
    expect(onSelectTool).toHaveBeenCalledWith({ kind: 'officeM', isShaft: false })
  })

  it('highlights a selected family and its selected variant', () => {
    render(
      <BuildPalette
        maxStarReached={1}
        mapId="city-tower"
        selectedTool={{ kind: 'officeS', isShaft: false }}
        onSelectTool={jest.fn()}
      />,
    )

    expect(screen.getByTestId('family-offices')).toHaveAccessibleName(`Offices, selected ${ITEM_DEFS.officeS.name}`)
    openFamily('offices')
    expect(screen.getByTestId('tool-officeS')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('tool-officeM')).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows footprint, income, capacity, maintenance, and affinity in a focus tooltip', () => {
    render(
      <BuildPalette
        maxStarReached={1}
        mapId="city-tower"
        selectedTool={{ kind: 'officeS', isShaft: false }}
        onSelectTool={jest.fn()}
      />,
    )

    fireEvent.focus(screen.getByTestId('family-offices'))
    expect(screen.getByTestId('tool-details-name')).toHaveTextContent(ITEM_DEFS.officeS.name)
    expect(screen.getByTestId('tool-details')).toHaveTextContent('6 tiles × 1 storey')
    expect(screen.getByTestId('tool-details')).toHaveTextContent('$400/day rent')
    expect(screen.getByTestId('tool-details')).toHaveTextContent('Capacity')
    expect(screen.getByTestId('tool-details')).toHaveTextContent('office')
  })

  it('omits absent fields for transit items', () => {
    render(<BuildPalette maxStarReached={1} mapId="city-tower" selectedTool={null} onSelectTool={jest.fn()} />)

    fireEvent.focus(screen.getByTestId('tool-stairs'))
    const details = screen.getByTestId('tool-details')
    expect(details).toHaveTextContent('2 tiles × 1 storey')
    expect(details).toHaveTextContent('$10/day')
    expect(details).toHaveTextContent('Above ground only')
    expect(details).not.toHaveTextContent('Capacity')
    expect(details).not.toHaveTextContent('Income')
    expect(details).not.toHaveTextContent('undefined')
    expect(details).not.toHaveTextContent('NaN')
  })

  it('keeps locked variants focusable for keyboard and touch details without selecting them', () => {
    const onSelectTool = jest.fn()
    render(<BuildPalette maxStarReached={1} mapId="city-tower" selectedTool={null} onSelectTool={onSelectTool} />)
    openFamily('hotel-rooms')

    const locked = screen.getByTestId('tool-hotel1p')
    fireEvent.focus(locked)
    expect(locked).not.toHaveAttribute('disabled')
    expect(locked).toHaveProperty('tabIndex', 0)
    expect(screen.getByTestId('tool-details-locked')).toHaveTextContent('requires ★')
    fireEvent.click(locked)
    expect(onSelectTool).not.toHaveBeenCalled()
  })

  it('searches across family variants and reports empty results', () => {
    render(<BuildPalette maxStarReached={5} mapId="city-tower" selectedTool={null} onSelectTool={jest.fn()} />)

    searchFor('glass')
    expect(screen.getByTestId('tool-glass')).toBeInTheDocument()
    expect(screen.queryByTestId('family-offices')).toBeNull()

    searchFor('not a tower tool')
    expect(screen.getByText('No matching build tools.')).toBeInTheDocument()
  })

  it('moves keyboard focus into a family and restores its trigger on Escape', async () => {
    render(<BuildPalette maxStarReached={5} mapId="city-tower" selectedTool={null} onSelectTool={jest.fn()} />)
    openFamily('apartments')
    expect(screen.getByTestId('family-apartments')).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(screen.getByTestId('tool-aptStudio')).toHaveFocus())

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByTestId('family-apartments')).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(screen.getByTestId('family-apartments')).toHaveFocus())
  })

  it('renders details for every item definition without undefined or NaN text', () => {
    for (const kind of Object.keys(ITEM_DEFS) as ItemKind[]) {
      const rendered = render(<BuildPalette maxStarReached={5} mapId="city-tower" selectedTool={null} onSelectTool={jest.fn()} />)
      searchFor(ITEM_DEFS[kind].name)
      fireEvent.focus(screen.getByTestId(`tool-${kind}`))
      const detailsText = screen.getByTestId('tool-details').textContent ?? ''
      expect(detailsText).not.toContain('undefined')
      expect(detailsText).not.toContain('NaN')
      rendered.unmount()
    }
  })
})
