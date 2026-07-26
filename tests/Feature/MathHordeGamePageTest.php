<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MathHordeGamePageTest extends TestCase
{
    use RefreshDatabase;

    public function test_math_horde_game_page_is_publicly_accessible(): void
    {
        $response = $this->get('/math-horde');

        $response->assertOk()
            ->assertSee('math-horde-root')
            ->assertSee('game-shell')
            ->assertDontSee('id="navbar"', false);
    }
}
