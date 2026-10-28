<?php

namespace Tests\Feature;

use Tests\TestCase;

class LoginReturnPathTest extends TestCase
{
    public function test_a_same_site_path_becomes_the_page_sign_in_returns_to(): void
    {
        $this->get('/login?next=/tower-2')
            ->assertOk()
            ->assertSessionHas('url.intended', url('/tower-2'));
    }

    public function test_other_sites_and_odd_paths_are_ignored(): void
    {
        foreach (['//evil.example.test/x', 'https://evil.example.test/', '/\\evil.example.test', 'tower-2', '/tower-2?x=1', '/tower 2'] as $next) {
            $this->get('/login?'.http_build_query(['next' => $next]))
                ->assertOk()
                ->assertSessionMissing('url.intended');
        }
    }
}
