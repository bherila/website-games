<?php

namespace App\Services\Games\Mandarin\Course;

use RuntimeException;

class CourseImportException extends RuntimeException
{
    /** @param list<string> $problems */
    public function __construct(string $message, public readonly array $problems)
    {
        parent::__construct($message.":\n - ".implode("\n - ", $problems));
    }
}
