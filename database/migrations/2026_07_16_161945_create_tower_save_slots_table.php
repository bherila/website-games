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
        Schema::create('tower_save_slots', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id');
            $table->string('slot', 16);
            // Opaque, versioned Tower Throwback save blob. The server never reads
            // into it; migration/validation of its shape is the client's job.
            $table->longText('payload')->nullable();
            $table->unsignedSmallInteger('wire_version')->nullable();
            // Denormalised display metadata so the load screen can render slot
            // summaries without decoding the payload.
            $table->unsignedInteger('game_day')->nullable();
            $table->unsignedTinyInteger('star')->nullable();
            $table->unsignedInteger('population')->nullable();
            $table->bigInteger('funds')->nullable();
            // Ownership lease: at most one active lease per slot.
            $table->string('lease_token', 64)->nullable();
            $table->timestamp('lease_acquired_at')->nullable();
            $table->timestamp('lease_expires_at')->nullable();
            $table->timestamps();

            $table->foreign('user_id', 'tss_user_fk')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();
            $table->unique(['user_id', 'slot'], 'tss_user_slot_uq');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tower_save_slots');
    }
};
