<?php

namespace App\Services\Games\Mandarin\Speech;

use RuntimeException;

/**
 * Provider failure with a contract error code. `retryable` distinguishes a
 * transient failure (timeout, throttling) from a configuration problem.
 */
class SpeechProviderException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly bool $retryable = false,
    ) {
        parent::__construct($message);
    }
}
