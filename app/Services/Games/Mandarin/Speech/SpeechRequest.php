<?php

namespace App\Services\Games\Mandarin\Speech;

final class SpeechRequest
{
    public function __construct(
        /** Exact authored Chinese to read. Never pinyin, English or labels. */
        public readonly string $text,
        /** normal | slow */
        public readonly string $variant,
        /** Story role: guide | traveler | friend | narrator. Not a guarantee of a distinct voice. */
        public readonly string $role,
    ) {}
}
