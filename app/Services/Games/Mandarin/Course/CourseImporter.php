<?php

namespace App\Services\Games\Mandarin\Course;

use App\Models\Mandarin\MandarinCourseRevision;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use RuntimeException;

/**
 * Idempotent import of a course JSON file into an immutable revision row.
 * Same course/version + same canonical hash: no-op. Different hash: conflict.
 */
class CourseImporter
{
    public function __construct(private readonly CourseValidator $validator) {}

    /**
     * @return array{status: 'imported'|'unchanged', revision: MandarinCourseRevision, problems: list<string>}
     */
    public function importFile(string $path, bool $publish = true): array
    {
        if (! is_file($path)) {
            throw new InvalidArgumentException("Course file not found: {$path}");
        }
        $raw = file_get_contents($path);
        if ($raw === false) {
            throw new InvalidArgumentException("Course file unreadable: {$path}");
        }
        /** @var mixed $decoded */
        $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        if (! is_array($decoded)) {
            throw new InvalidArgumentException('Course file must decode to an object');
        }

        return $this->import($decoded, $publish);
    }

    /**
     * @param  array<string, mixed>  $course
     * @return array{status: 'imported'|'unchanged', revision: MandarinCourseRevision, problems: list<string>}
     */
    public function import(array $course, bool $publish = true): array
    {
        $problems = $this->validator->validate($course);
        if ($problems !== []) {
            throw new CourseImportException('Course failed validation', $problems);
        }
        $hash = CourseValidator::canonicalHash($course);
        $courseId = (string) $course['courseId'];
        $version = (string) $course['contentVersion'];
        $provenance = is_array($course['provenance']) ? $course['provenance'] : [];

        return DB::transaction(function () use ($course, $hash, $courseId, $version, $provenance, $publish): array {
            $existing = MandarinCourseRevision::query()
                ->where('course_id', $courseId)
                ->where('content_version', $version)
                ->lockForUpdate()
                ->first();
            if ($existing !== null) {
                if ($existing->content_hash === $hash) {
                    return ['status' => 'unchanged', 'revision' => $existing, 'problems' => []];
                }
                throw new RuntimeException("Course {$courseId}@{$version} is already imported with a different payload (stored {$existing->content_hash}, file {$hash}). Publish a new contentVersion instead of mutating a released revision.");
            }
            $revision = MandarinCourseRevision::query()->create([
                'course_id' => $courseId,
                'content_version' => $version,
                'content_hash' => $hash,
                'status' => $publish ? 'published' : 'staged',
                'native_reviewed' => (bool) ($provenance['nativeReviewed'] ?? false),
                'audio_auditioned' => (bool) ($provenance['audioAuditioned'] ?? false),
                'payload' => CourseValidator::canonicalJson($course),
                'imported_at' => now(),
            ]);

            return ['status' => 'imported', 'revision' => $revision, 'problems' => []];
        });
    }

    public function activate(MandarinCourseRevision $revision): bool
    {
        return DB::transaction(function () use ($revision): bool {
            $revisions = MandarinCourseRevision::query()
                ->where('course_id', $revision->course_id)
                ->lockForUpdate()
                ->get();
            $changed = false;

            foreach ($revisions as $candidate) {
                $status = $candidate->is($revision) ? 'published' : 'superseded';
                if ($candidate->status === $status) {
                    continue;
                }
                $candidate->status = $status;
                $candidate->save();
                $changed = true;
            }

            return $changed;
        });
    }
}
