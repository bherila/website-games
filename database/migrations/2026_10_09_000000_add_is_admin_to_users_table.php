<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * An explicit application-administrator flag.
 *
 * Accounts are created at first sign-in for whoever the identity provider vouches for, so
 * being an account here says nothing about being trusted to operate the app. Administrator
 * is a separate, deliberate grant (`php artisan users:admin grant <id>`), stored here and
 * nowhere else, and every new row starts without it.
 *
 * Existing users are deliberately NOT backfilled. Nothing in the app marked anyone as
 * privileged before this column existed (no allowlist, no "user 1" check, no configured
 * address), so there is no signal to backfill from. The obvious stand-in, the oldest row,
 * is simply whoever signed in first, and promoting it would turn an accident of ordering
 * into authority. The deploy therefore leaves zero administrators until an operator
 * grants the first one; the only surface the flag gates is already closed by default.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('is_admin')->default(false)->after('oauth_subject');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('is_admin');
        });
    }
};
