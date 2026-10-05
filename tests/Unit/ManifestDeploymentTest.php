<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class ManifestDeploymentTest extends TestCase
{
    public function test_operational_audit_preserves_the_atomic_production_contract(): void
    {
        $workflow = file_get_contents(dirname(__DIR__, 2).'/.github/workflows/ci.yml');

        self::assertIsString($workflow);
        foreach ([
            // v2.2.1 and later: every SSH call shares one multiplexed connection with
            // ServerAliveInterval keepalives. v2.1.2 had none, so a quiet Artisan
            // step outlived the runner's idle-TCP timeout and stranded production
            // in maintenance (2026-09-29).
            'bherila/shared-cpanel-deployment@395b0d8b10db1181e50f4eec27d7bce27b1522d6',
            'operational-audit: true',
            'deployment-mode: atomic',
            'atomic-layout: stable-directory',
            'persistent-paths: storage',
            'failure-policy: maintenance',
            'install-cron: false',
            'artisan-memory-limit: 1G',
            'quiesce-script: scripts/deploy/assert-no-running-artisan.sh',
            'post-activate-script: scripts/deploy/activate-mandarin-course.sh',
            'verification-script: scripts/deploy/verify-production.sh',
            "!cancelled() && github.event_name == 'push' && github.ref == 'refs/heads/main'",
            "needs.test.result == 'success' && needs['frontend-build'].result == 'success'",
        ] as $contract) {
            self::assertStringContainsString($contract, $workflow);
        }
        self::assertMatchesRegularExpression(
            '/group: website-games-production\R\s+cancel-in-progress: false/',
            $workflow,
        );
    }

    /**
     * A deploy that fails after the risk boundary leaves the site in
     * maintenance on purpose, and later deploys refuse to touch it, so only a
     * check outside the deploy notices. On 2026-09-29 nothing did for five days.
     */
    public function test_production_is_watched_outside_the_deploy(): void
    {
        $root = dirname(__DIR__, 2);
        $health = file_get_contents($root.'/.github/workflows/production-health.yml');
        $deploy = file_get_contents($root.'/.github/workflows/ci.yml');

        self::assertIsString($health);
        self::assertIsString($deploy);
        self::assertMatchesRegularExpression('/schedule:\R\s+- cron: /', $health);
        foreach (['SITE: https://games.bherila.net', 'for path in / /up', "label = 'production-down'", 'issues: write'] as $contract) {
            self::assertStringContainsString($contract, $health);
        }
        self::assertStringContainsString('docs/deploy-recovery.md', $deploy);
        self::assertFileExists($root.'/docs/deploy-recovery.md');
    }

    public function test_audio_import_preflights_strictly_before_writing_shared_data(): void
    {
        $workflow = file_get_contents(dirname(__DIR__, 2).'/.github/workflows/ci.yml');

        self::assertIsString($workflow);
        self::assertMatchesRegularExpression(
            '/artisan-commands: \|\s+mandarin:course:import --stage\s+'
            .'mandarin:audio:import resources\/data\/mandarin\/audio-manifest\.json --dry-run --verify-objects --strict --require-configured-course\s+'
            .'mandarin:audio:import resources\/data\/mandarin\/audio-manifest\.json --execute --verify-objects --strict --require-configured-course/',
            $workflow,
        );
    }

    public function test_static_web_server_assigns_the_standard_manifest_mime_type(): void
    {
        $contents = file_get_contents(dirname(__DIR__, 2).'/public/.htaccess');

        self::assertIsString($contents);
        self::assertMatchesRegularExpression(
            '/^\s*AddType\s+application\/manifest\+json\s+\.webmanifest\s*$/m',
            $contents,
        );
    }

    public function test_production_deployment_smokes_the_manifest_mime_type(): void
    {
        $root = dirname(__DIR__, 2);
        $workflow = file_get_contents($root.'/.github/workflows/ci.yml');
        $verification = file_get_contents($root.'/scripts/deploy/verify-production.sh');

        self::assertIsString($workflow);
        self::assertIsString($verification);
        self::assertStringContainsString('verification-script: scripts/deploy/verify-production.sh', $workflow);
        self::assertStringContainsString('/manifest.webmanifest', $verification);
        self::assertStringContainsString('application/manifest+json | application/json', $verification);
    }
}
