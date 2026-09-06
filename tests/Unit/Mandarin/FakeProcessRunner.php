<?php

namespace Tests\Unit\Mandarin;

use App\Services\Games\Mandarin\Speech\ProcessResult;
use App\Services\Games\Mandarin\Speech\ProcessRunner;
use Closure;

/** Scripted subprocess runner: each handler inspects the argv array and may write output files. */
class FakeProcessRunner implements ProcessRunner
{
    /** @var list<list<string>> */
    public array $calls = [];

    /** @param Closure(list<string>): ProcessResult $handler */
    public function __construct(private readonly Closure $handler) {}

    public function run(array $command, int $timeoutSeconds = 60): ProcessResult
    {
        $this->calls[] = $command;

        return ($this->handler)($command);
    }
}
