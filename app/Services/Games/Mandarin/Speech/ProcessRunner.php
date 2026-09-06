<?php

namespace App\Services\Games\Mandarin\Speech;

/**
 * Thin seam over subprocess execution so providers can be unit-tested with a
 * fake. Commands are always argument arrays; lesson text never touches a shell.
 */
interface ProcessRunner
{
    /**
     * @param  list<string>  $command
     */
    public function run(array $command, int $timeoutSeconds = 60): ProcessResult;
}
