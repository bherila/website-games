<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Sign-in methods beyond the identity provider, starting with Google. The identity provider's
 * binding stays on `users.oauth_provider` + `users.oauth_subject`, which administrator and
 * delegated-access rules depend on; each row here is an additional, independent way into the
 * same account. Subjects are byte-exact on MySQL for the same reason as that binding (see
 * 2026_07_31_000000_make_oauth_identity_case_sensitive).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_identities', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('provider', 32);
            $table->string('subject', 191);
            // The provider's address when linked, shown on the account page. Never used to match.
            $table->string('email')->nullable();
            $table->timestamps();
            $table->unique(['provider', 'subject']);
            $table->unique(['user_id', 'provider']);
        });

        if (in_array(DB::connection()->getConfig('driver'), ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE user_identities MODIFY provider VARBINARY(32) NOT NULL, MODIFY subject VARBINARY(191) NOT NULL');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('user_identities');
    }
};
