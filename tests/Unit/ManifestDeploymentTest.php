<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class ManifestDeploymentTest extends TestCase
{
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
