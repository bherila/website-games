<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class ManifestDeploymentTest extends TestCase
{
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
