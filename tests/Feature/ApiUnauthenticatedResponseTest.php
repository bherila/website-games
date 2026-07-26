<?php

namespace Tests\Feature;

use Tests\TestCase;

class ApiUnauthenticatedResponseTest extends TestCase
{
    public function test_unauthenticated_api_request_without_json_accept_header_gets_401_json(): void
    {
        $this->get('/api/games/data', ['Accept' => 'text/html'])
            ->assertUnauthorized()
            ->assertHeader('Content-Type', 'application/json')
            ->assertJson(['message' => 'Unauthenticated.']);
    }

    public function test_unauthenticated_api_request_with_json_accept_header_gets_401_json(): void
    {
        $this->getJson('/api/games/data')
            ->assertUnauthorized()
            ->assertJson(['message' => 'Unauthenticated.']);
    }
}
