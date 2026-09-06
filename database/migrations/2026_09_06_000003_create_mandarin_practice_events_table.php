<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Append-only practice log. One row per accepted client event; the payload is
 * immutable and the (user, client_event_id) pair is unique so a retried upload
 * is acknowledged as already-present and a reused id with a different payload
 * is a conflict. `sequence` is the canonical per-user order.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mandarin_practice_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('client_event_id', 64);
            $table->unsignedBigInteger('sequence');
            $table->string('course_id', 64);
            $table->string('content_version', 32);
            $table->string('kind', 32);
            $table->string('mode', 24);
            $table->string('opportunity_id', 64)->nullable();
            $table->string('scene_id', 32)->nullable();
            $table->string('node_id', 32)->nullable();
            $table->string('exercise_id', 32)->nullable();
            $table->string('target_id', 64)->nullable();
            $table->string('correctness', 16)->nullable();
            $table->string('grade', 8)->nullable();
            $table->boolean('schedule_eligible')->default(false);
            $table->string('payload_hash', 64);
            $table->text('payload');
            // dateTime, not timestamp: a NOT NULL TIMESTAMP without a default is refused by
            // MySQL/MariaDB under NO_ZERO_DATE ("Invalid default value"); the code always sets both.
            $table->dateTime('client_occurred_at')->nullable();
            $table->dateTime('accepted_at');

            $table->unique(['user_id', 'client_event_id']);
            $table->unique(['user_id', 'sequence']);
            // Named explicitly: the generated name is 66 characters, over MySQL/MariaDB's 64 limit.
            $table->index(['user_id', 'target_id', 'schedule_eligible'], 'mandarin_events_user_target_eligible_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mandarin_practice_events');
    }
};
