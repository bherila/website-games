<?php

namespace App\Console\Commands\Mandarin;

use App\Services\Games\Mandarin\Course\CourseRepository;
use App\Services\Games\Mandarin\Course\CourseValidator;
use Illuminate\Console\Command;

class ValidateCourseCommand extends Command
{
    protected $signature = 'mandarin:validate {path? : Course JSON file (defaults to config mandarin.course.source)}';

    protected $description = 'Validate a Mandarin course JSON file and compare it with the published revision.';

    public function handle(CourseValidator $validator, CourseRepository $repository): int
    {
        $path = (string) ($this->argument('path') ?? config('mandarin.course.source'));
        if (! is_file($path)) {
            $this->error("File not found: {$path}");

            return self::FAILURE;
        }
        /** @var mixed $decoded */
        $decoded = json_decode((string) file_get_contents($path), true);
        if (! is_array($decoded)) {
            $this->error('File is not a JSON object.');

            return self::FAILURE;
        }
        $problems = $validator->validate($decoded);
        if ($problems !== []) {
            $this->error(count($problems).' problem(s):');
            foreach ($problems as $problem) {
                $this->line(" - {$problem}");
            }

            return self::FAILURE;
        }
        $hash = CourseValidator::canonicalHash($decoded);
        $this->info("Valid. Canonical hash {$hash}");
        $published = $repository->revisionModel((string) $decoded['courseId'], (string) $decoded['contentVersion']);
        if ($published === null) {
            $this->warn('Not imported yet: run mandarin:course:import.');
        } elseif ($published->content_hash === $hash) {
            $this->info('Matches the imported revision.');
        } else {
            $this->error("Differs from the imported revision ({$published->content_hash}). Publish a new contentVersion.");

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
