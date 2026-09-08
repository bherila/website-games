<?php

namespace App\Console\Commands\Mandarin;

use App\Services\Games\Mandarin\Course\CourseImporter;
use App\Services\Games\Mandarin\Course\CourseImportException;
use Illuminate\Console\Command;
use RuntimeException;

class ImportCourseCommand extends Command
{
    protected $signature = 'mandarin:course:import {path? : Course JSON file (defaults to config mandarin.course.source)} {--stage : Import a new revision without publishing it} {--activate : Make this exact revision the published course}';

    protected $description = 'Import a Mandarin course JSON file as an immutable published revision (idempotent).';

    public function handle(CourseImporter $importer): int
    {
        if ($this->option('stage') && $this->option('activate')) {
            $this->error('Pass either --stage or --activate, not both.');

            return self::FAILURE;
        }
        $path = (string) ($this->argument('path') ?? config('mandarin.course.source'));
        try {
            $result = $importer->importFile($path, ! $this->option('stage'));
        } catch (CourseImportException $exception) {
            $this->error('Validation failed:');
            foreach ($exception->problems as $problem) {
                $this->line(" - {$problem}");
            }

            return self::FAILURE;
        } catch (RuntimeException $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }
        $revision = $result['revision'];
        $course = $revision->decoded();
        $this->info(sprintf(
            '%s %s@%s (hash %s): %d scenes, %d nodes, %d targets, %d support, %d utterances, %d exercises, %d constructions, %d checkpoints. nativeReviewed=%s audioAuditioned=%s',
            $result['status'] === 'imported' ? 'Imported' : 'Unchanged',
            $revision->course_id,
            $revision->content_version,
            substr($revision->content_hash, 0, 12),
            count($course['scenes']),
            count($course['nodes']),
            count($course['targets']),
            count($course['supportGlossary']),
            count($course['utterances']),
            count($course['exercises']),
            count($course['constructionExercises']),
            count($course['checkpointExercises']),
            $revision->native_reviewed ? 'true' : 'false',
            $revision->audio_auditioned ? 'true' : 'false',
        ));
        if ($this->option('activate')) {
            $changed = $importer->activate($revision);
            $this->info(sprintf(
                $changed ? 'Activated %s@%s.' : 'Already active: %s@%s.',
                $revision->course_id,
                $revision->content_version,
            ));
        }

        return self::SUCCESS;
    }
}
