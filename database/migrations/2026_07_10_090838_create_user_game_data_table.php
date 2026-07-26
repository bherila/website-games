<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('user_game_data', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id');
            $table->string('game', 64);
            $table->string('scope', 16);
            $table->string('slot', 64);
            $table->json('data');
            $table->unsignedBigInteger('revision')->default(0);
            $table->boolean('is_deleted')->default(false);
            $table->uuid('writer_id')->nullable();
            $table->unsignedBigInteger('writer_sequence')->nullable();
            $table->timestamps();

            $table->foreign('user_id', 'ugd_user_fk')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();
            $table->unique(['user_id', 'game', 'scope', 'slot'], 'ugd_user_game_scope_slot_uq');
            $table->index(['user_id', 'is_deleted'], 'ugd_user_deleted_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('user_game_data');
    }
};
