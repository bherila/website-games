<?php

namespace App\Services\Games\Mandarin\Speech;

final class SynthesizedAudio
{
    /**
     * @param  array<string, mixed>  $providerMetadata
     */
    public function __construct(
        public readonly string $bytes,
        public readonly string $contentType,
        public readonly string $extension,
        public readonly int $charactersBilled,
        public readonly array $providerMetadata = [],
    ) {}
}
