<?php

namespace App\Services\Games\Mandarin\Speech;

final class ProcessResult
{
    public function __construct(
        public readonly int $exitCode,
        public readonly string $stdout,
        public readonly string $stderr,
    ) {}

    public function ok(): bool
    {
        return $this->exitCode === 0;
    }
}
