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
        $contents = file_get_contents(dirname(__DIR__, 2).'/.github/workflows/ci.yml');

        self::assertIsString($contents);
        self::assertStringContainsString('Verify deployed manifest MIME type', $contents);
        self::assertStringContainsString('https://games.bherila.net/manifest.webmanifest', $contents);
        self::assertStringContainsString('application/manifest+json|application/json', $contents);
    }
}
