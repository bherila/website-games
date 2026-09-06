<?php

namespace App\Services\Games\Mandarin\Course;

use App\Models\Mandarin\MandarinCourseRevision;
use RuntimeException;

/**
 * Reads published course revisions from the database. The file under
 * resources/data is only an import source; live play always serves an
 * imported revision so preview JSON and live JSON cannot drift silently.
 */
class CourseRepository
{
    /** @var array<string, CourseIndex> */
    private array $cache = [];

    public function published(?string $courseId = null): ?CourseIndex
    {
        $courseId ??= (string) config('mandarin.course.id');
        $revision = MandarinCourseRevision::query()
            ->where('course_id', $courseId)
            ->where('status', 'published')
            ->orderByDesc('imported_at')
            ->orderByDesc('id')
            ->first();

        return $revision === null ? null : $this->index($revision);
    }

    public function publishedOrFail(?string $courseId = null): CourseIndex
    {
        return $this->published($courseId) ?? throw new RuntimeException('No published Mandarin course revision. Run `php -d memory_limit=1G artisan mandarin:course:import`.');
    }

    public function revision(string $courseId, string $contentVersion): ?CourseIndex
    {
        $revision = MandarinCourseRevision::query()
            ->where('course_id', $courseId)
            ->where('content_version', $contentVersion)
            ->first();

        return $revision === null ? null : $this->index($revision);
    }

    public function revisionModel(string $courseId, string $contentVersion): ?MandarinCourseRevision
    {
        return MandarinCourseRevision::query()
            ->where('course_id', $courseId)
            ->where('content_version', $contentVersion)
            ->first();
    }

    private function index(MandarinCourseRevision $revision): CourseIndex
    {
        $key = $revision->course_id.'@'.$revision->content_version.'#'.$revision->content_hash;

        return $this->cache[$key] ??= new CourseIndex($revision->decoded());
    }
}
