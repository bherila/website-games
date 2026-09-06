<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lazy audio generation state.
 *
 * `mandarin_audio_assets` is keyed by the synthesis recipe hash (provider,
 * voice, rate, format, normalized text, template version). Two utterances that
 * resolve to the same recipe share one row and one object. The row carries a
 * lease so only one worker generates at a time and a stale worker cannot
 * publish over a newer attempt.
 *
 * `mandarin_audio_sources` maps a course source (utterance/target/sfx +
 * variant) to the recipe it currently resolves to; changing a voice or rate
 * creates a new asset identity and repoints the source without touching the
 * old object.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mandarin_audio_assets', function (Blueprint $table): void {
            $table->id();
            $table->string('recipe_hash', 64)->unique();
            $table->string('provider', 32);
            $table->string('kind', 16); // speech | sfx
            $table->string('state', 16)->index(); // queued | generating | ready | failed
            $table->text('recipe');
            $table->unsignedInteger('text_length')->default(0);
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->string('lease_token', 40)->nullable();
            $table->timestamp('lease_expires_at')->nullable();
            $table->string('disk', 32)->nullable();
            $table->string('object_key', 191)->nullable();
            $table->string('content_hash', 64)->nullable();
            $table->string('content_type', 64)->nullable();
            $table->unsignedInteger('bytes')->nullable();
            $table->unsignedInteger('duration_ms')->nullable();
            $table->string('error_code', 40)->nullable();
            $table->text('error_message')->nullable();
            $table->text('provider_metadata')->nullable();
            $table->timestamp('ready_at')->nullable();
            $table->timestamps();
        });

        Schema::create('mandarin_audio_sources', function (Blueprint $table): void {
            $table->id();
            $table->string('course_id', 64);
            $table->string('content_version', 32);
            $table->string('source_kind', 16);
            $table->string('source_id', 64);
            $table->string('variant', 16);
            $table->string('recipe_hash', 64)->index();
            $table->timestamps();

            $table->unique(['course_id', 'content_version', 'source_kind', 'source_id', 'variant'], 'mandarin_audio_sources_identity');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mandarin_audio_sources');
        Schema::dropIfExists('mandarin_audio_assets');
    }
};
