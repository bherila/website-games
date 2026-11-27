<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tower_save_slots', function (Blueprint $table): void {
            $table->uuid('content_revision')->nullable();
            $table->boolean('is_deleted')->default(false);
        });
        DB::table('tower_save_slots')->orderBy('id')->chunkById(200, function ($rows): void {
            foreach ($rows as $row) {
                DB::table('tower_save_slots')->where('id', $row->id)->update(['content_revision' => (string) Str::uuid()]);
            }
        });
    }

    public function down(): void
    {
        Schema::table('tower_save_slots', fn (Blueprint $table) => $table->dropColumn(['content_revision', 'is_deleted']));
    }
};
