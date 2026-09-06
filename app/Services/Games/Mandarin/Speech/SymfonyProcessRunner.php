<?php

namespace App\Services\Games\Mandarin\Speech;

use Symfony\Component\Process\Exception\ProcessTimedOutException;
use Symfony\Component\Process\Process;

class SymfonyProcessRunner implements ProcessRunner
{
    public function run(array $command, int $timeoutSeconds = 60): ProcessResult
    {
        $process = new Process($command);
        $process->setTimeout($timeoutSeconds);
        try {
            $process->run();
        } catch (ProcessTimedOutException) {
            return new ProcessResult(124, $process->getOutput(), 'timed out after '.$timeoutSeconds.'s');
        }

        return new ProcessResult($process->getExitCode() ?? 1, $process->getOutput(), $process->getErrorOutput());
    }
}
