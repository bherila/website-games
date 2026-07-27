import { fireEvent, render, screen } from '@testing-library/react'

import type { TenantRequest } from '../../gameTypes'
import { TenantRequestCard } from '../TenantRequestCard'

function request(overrides: Partial<TenantRequest> = {}): TenantRequest {
  return {
    id: 41,
    description: 'Build a restroom near the affected tenants',
    wantsKind: 'restroom',
    nearFloor: -2,
    expiresDay: 8,
    ...overrides,
  }
}

describe('TenantRequestCard', () => {
  it('keeps the active request details and numeric floor navigation available', () => {
    const onViewFloor = jest.fn()

    render(<TenantRequestCard request={request()} onViewFloor={onViewFloor} />)

    expect(screen.getByTestId('tenant-request-card')).toHaveTextContent('Build a restroom near the affected tenants')
    expect(screen.getByTestId('tenant-request-kind')).toHaveTextContent('Restroom')
    expect(screen.getByTestId('tenant-request-floor')).toHaveTextContent('B2')
    expect(screen.getByTestId('tenant-request-expiry')).toHaveTextContent('Day 8')

    fireEvent.click(screen.getByTestId('view-request-floor'))
    expect(onViewFloor).toHaveBeenCalledWith(-2)
  })

  it('names shaft requests from the shaft catalog', () => {
    render(<TenantRequestCard request={request({ wantsKind: 'express' })} onViewFloor={jest.fn()} />)

    expect(screen.getByTestId('tenant-request-kind')).toHaveTextContent('Express Elevator')
  })
})
