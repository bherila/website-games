<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Immutable, validated snapshots of the Mandarin course JSON. Same
 * course/version + same canonical payload is a no-op import; same
 * course/version + different payload is a conflict. Previous revisions stay
 * readable so previously accepted events can still be validated.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mandarin_course_revisions', function (Blueprint $table): void {
            $table->id();
            $table->string('course_id', 64);
            $table->string('content_version', 32);
            $table->string('content_hash', 64);
            $table->string('status', 16)->default('published');
            $table->boolean('native_reviewed')->default(false);
            $table->boolean('audio_auditioned')->default(false);
            $table->longText('payload');
            // dateTime, not timestamp: MySQL/MariaDB give the first TIMESTAMP column an implicit
            // ON UPDATE CURRENT_TIMESTAMP, which would rewrite the import time on every update.
            $table->dateTime('imported_at');
            $table->timestamps();

            $table->unique(['course_id', 'content_version']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mandarin_course_revisions');
    }
};
