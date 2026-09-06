<?php

namespace App\Services\Games\Mandarin\Speech;

final class ProviderProbe
{
    /**
     * @param  list<string>  $problems
     * @param  array<string, mixed>  $details
     */
    public function __construct(
        public readonly bool $ok,
        public readonly array $problems = [],
        public readonly array $details = [],
    ) {}
}
