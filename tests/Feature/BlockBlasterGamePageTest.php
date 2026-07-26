<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BlockBlasterGamePageTest extends TestCase
{
    use RefreshDatabase;

    public function test_block_blaster_game_page_is_publicly_accessible(): void
    {
        $response = $this->get('/block-blaster');

        $response->assertOk()
            ->assertSee('block-blaster-root')
            ->assertSee('game-shell')
            ->assertDontSee('id="navbar"', false);
    }
}
