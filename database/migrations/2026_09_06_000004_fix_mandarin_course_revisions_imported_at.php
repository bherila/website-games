<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * `imported_at` was created as a TIMESTAMP with no explicit default. On MySQL and
 * MariaDB (explicit_defaults_for_timestamp off) the first such column silently gets
 * DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, so any update to a revision
 * row — publishing, flipping a review flag — rewrote its import time and could change
 * which revision `CourseRepository` treats as newest. Make it a plain DATETIME; the
 * importer always sets it. Other drivers have no such behaviour and already carry the
 * corrected create migration.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE `mandarin_course_revisions` MODIFY `imported_at` DATETIME NOT NULL');
        }
    }

    public function down(): void
    {
        // Intentionally nothing: restoring the implicit ON UPDATE behaviour is the bug.
    }
};
