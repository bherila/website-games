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
2. If the deploy failed before *Run the atomic post-activation script*, run
   `php -d memory_limit=1G artisan mandarin:course:import --activate --no-ansi`,
   which is what `scripts/deploy/activate-mandarin-course.sh` runs. Do it while
   the site is still in maintenance. Nothing else publishes the staged course.
3. If the deploy log reports preserved cron at
   `~/.deployments/<deploy-dir>/recovery/<release>.cron`, restore those lines.
   It normally holds the `# JOB:games-laravel-scheduler` line. Save `crontab -l` to a
   backup file, edit a copy, install the copy with `crontab <file>`, and diff the
   result against the backup. Never pipe `crontab -l` into `crontab -`.
4. Run `php artisan up`.
5. Check that `/` and `/up` both return 200.
6. Run `scripts/deploy/verify-production.sh` from a checkout of the live
   commit. Set `DEPLOYMENT_MODE=atomic`, `DEPLOY_SITE_URL`, and set
   `DEPLOY_RELEASE_ID`, `DEPLOY_LIVE_RELEASE`, `DEPLOY_SOURCE_COMMIT` and
   `DEPLOY_LIVE_COMMIT` from the log, with `DEPLOY_LIVE_STATE=serving`.
7. Re-run the newest CI run on `main`, or push again, so the newest commit
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

## 2026-10-25 and 2026-10-26 incidents

- **What happened:** twice, the deploy finished, ran `artisan up`, and then the
  production check read `/deployment-identity.json` as a 200 HTML page instead
  of the JSON file (`jq: parse error`). The finalizer put the site back into
  maintenance, and it returned 503 until recovered by hand. Minutes later the
  same request answered correct JSON. The paused scheduler cron line had to be
  restored too (`# JOB:games-laravel-scheduler`).
- **The fix (#156):** `scripts/deploy/verify-production.sh` retries each
  content check (identity, manifest type, Mandarin bootstrap) for about a minute
  before failing, sends `Cache-Control: no-cache`, and on failure prints the last
  response's content type and first bytes.

## 2026-10-27 incident

- **What happened:** about a minute into the executed audio import, a hangup
  signal on the host killed PHP (`Hangup`, exit 129). The SSH session was still
  alive, so this was not the idle disconnect fixed in v2.2.1. The failure came
  after the risk boundary, so the site stayed in maintenance. The course
  activation in the post-activation script never ran, and the paused scheduler
  cron line had to be restored by hand.
- **The fix:**
  - action v2.5.0, which starts every remote step under `nohup`, so neither
    Artisan nor the hooks can be killed by SIGHUP;
  - recovery step 2 above, for failures that come before course activation.
