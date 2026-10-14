import { ExternalLink } from 'lucide-react'
import type { ReactElement } from 'react'

import Container from '@/components/container'
import MainTitle from '@/components/MainTitle'

import { type AudioApi, MandarinAudioDashboard, type MandarinPanelData } from './mandarin'
import type { PanelData } from './types'

export interface AdminPageProps {
  panel: PanelData & MandarinPanelData
  api?: AudioApi | undefined
}

export function AdminPage({ panel, api }: AdminPageProps): ReactElement {
  return (
    <Container>
      <div className="mx-auto flex max-w-6xl flex-col gap-8 py-6">
        <header>
          <MainTitle>Admin</MainTitle>
          <p className="text-muted-foreground">Operator tools for this application. Everything here is limited to application administrators.</p>
        </header>
        <UsersCard usersUrl={panel.usersUrl} />
        <MandarinAudioDashboard api={api} panel={panel} />
      </div>
    </Container>
  )
}

function UsersCard({ usersUrl }: { usersUrl: string | null }): ReactElement {
  return (
    <section aria-labelledby="users-heading" className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="mb-2 text-xl font-bold" id="users-heading">Users</h2>
      {usersUrl === null
        ? (
            <p className="text-sm text-muted-foreground" data-testid="users-unconfigured">
              User management is not configured: set the identity provider&apos;s address and this application&apos;s delegated access key.
            </p>
          )
        : (
            <a className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline" data-testid="users-link" href={usersUrl} rel="noopener noreferrer" target="_blank">
              Manage users
              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          )}
      <p className="mt-2 text-sm text-muted-foreground">
        On the server, <code className="rounded bg-muted px-1">php artisan users:admin grant|revoke|list</code> manages administrators as well.
      </p>
    </section>
  )
}
