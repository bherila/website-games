<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Tower2PrototypePageTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_unlisted_prototype_page_mounts_and_stays_out_of_search(): void
    {
        $this->withoutVite();

        $this->get('/tower-2')
            ->assertOk()
            ->assertSee('id="tower-2-root"', false)
            ->assertSee('<meta name="robots" content="noindex, nofollow">', false);
    }

    public function test_the_games_hub_does_not_list_the_prototype(): void
    {
        $this->withoutVite();

        $this->get('/')->assertOk()->assertDontSee('/tower-2', false);
    }
}
