<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mandarin_practice_events', function (Blueprint $table): void {
            $table->unsignedSmallInteger('schema_version')->default(1);
            $table->string('card_key', 160)->nullable();
            $table->index(['user_id', 'card_key', 'schedule_eligible'], 'mandarin_events_user_card_eligible_index');
        });

        // PHP concatenation works on SQLite and MariaDB alike. Keep the payload
        // and its hash intact: an old queued upload must still be idempotent.
        DB::table('mandarin_practice_events')->whereNotNull('target_id')
            ->select(['id', 'target_id'])->chunkById(500, function ($rows): void {
                foreach ($rows as $row) {
                    DB::table('mandarin_practice_events')->where('id', $row->id)
                        ->update(['card_key' => 'target:'.$row->target_id.'#listen.meaning']);
                }
            });
    }

    public function down(): void
    {
        Schema::table('mandarin_practice_events', function (Blueprint $table): void {
            $table->dropIndex('mandarin_events_user_card_eligible_index');
            $table->dropColumn(['schema_version', 'card_key']);
        });
    }
};
