# Recovering a deploy stranded in maintenance

Production deploys through `bherila/shared-cpanel-deployment` in atomic mode with
`failure-policy: maintenance` (`.github/workflows/ci.yml`). The deploy takes the
site into Laravel maintenance, migrates, selects the new release, runs the
Mandarin import commands, then runs `artisan up`. A failure between the
database-risk boundary and `artisan up` leaves the site returning **503 on every
path** on purpose, because the schema may no longer match the previous code.

Every later deploy then refuses with *"The selected application is already in
maintenance; refusing to change intentional operator state."* Nothing recovers
by itself, so a person has to.

## How you find out

- The **Production Health** workflow (`production-health.yml`) probes `/` and
  `/up` every 20 minutes. It opens one `production-down` issue when they have
  failed for about six minutes, and closes that issue when they serve again.
- The failed **CI** run's *Deploy to Production* job ends with
  `Deployment failed after the risk boundary; selected code remains in maintenance.`
  and lists `live_release`, `live_commit` and `live_state=maintenance`.

## Diagnose

1. Open the first failed deploy, not a later one that refused. In its log, find
   the last `start-action` before `##[error]`; that step is what failed.
2. Decide whether that step's work is safe to finish by hand:
   - **Migrations** are done if *Verify migrations completed* passed.
   - **Import dry runs** write nothing.
   - **Executed imports** are idempotent, so re-running them is a no-op.
3. `client_loop: send disconnect: Broken pipe` with exit 255 means the
   runner's SSH connection dropped. It is not an application error.

## Recover

On the deploy host, inside the deploy directory (`deploy-dir` in `ci.yml`),
use the PHP binary and memory limit from the deploy log:

1. Re-run whichever `artisan-commands` lines from `ci.yml` did not complete,
   in order. The site stays in maintenance while they run.
2. If the deploy log reports preserved cron at
   `~/.deployments/<deploy-dir>/recovery/<release>.cron`, restore those lines.
   Games installs no cron, so that file is normally empty.
3. Run `php artisan up`.
4. Check that `/` and `/up` both return 200.
5. Run `scripts/deploy/verify-production.sh` from a checkout of the live
   commit. Set `DEPLOYMENT_MODE=atomic`, `DEPLOY_SITE_URL`, and set
   `DEPLOY_RELEASE_ID`, `DEPLOY_LIVE_RELEASE`, `DEPLOY_SOURCE_COMMIT` and
   `DEPLOY_LIVE_COMMIT` from the log, with `DEPLOY_LIVE_STATE=serving`.
6. Re-run the newest CI run on `main`, or push again, so the newest commit
   deploys normally.

If the failure was a migration, do not bring the old code up against the
new schema. Fix forward, or restore the schema deliberately first.

## 2026-09-29 incident

- **What happened:** the audio import's object check ran for more than four
  minutes without output. Action v2.1.2 set no SSH keepalive, so the runner's
  idle connection was dropped and the site stayed in maintenance until
  2026-10-04.
- **The fix:**
  - action v2.2.1, which sends SSH keepalives;
  - one metadata request per object, with progress output and HTTP timeouts;
  - the Production Health workflow.
