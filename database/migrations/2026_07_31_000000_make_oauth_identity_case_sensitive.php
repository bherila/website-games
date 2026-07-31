<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * OIDC subject identifiers are case-sensitive strings. The production MySQL
 * connection defaults to utf8mb4_unicode_ci, which would otherwise make `Alice`
 * and `alice` compare equal in both the identity lookup and its unique index.
 *
 * VARBINARY is deliberate rather than utf8mb4_bin: that older binary collation
 * still has PAD SPACE semantics, while identity matching must preserve every
 * byte, including trailing spaces. SQLite and PostgreSQL varchar equality
 * already preserves the distinctions covered here.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! $this->usesMySqlFamily()) {
            return;
        }

        DB::statement(
            'ALTER TABLE users
                MODIFY oauth_provider VARBINARY(64) NULL,
                MODIFY oauth_subject VARBINARY(191) NULL'
        );
    }

    public function down(): void
    {
        if (! $this->usesMySqlFamily()) {
            return;
        }

        DB::statement(
            'ALTER TABLE users
                MODIFY oauth_provider VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
                MODIFY oauth_subject VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL'
        );
    }

    private function usesMySqlFamily(): bool
    {
        return in_array(DB::connection()->getConfig('driver'), ['mysql', 'mariadb'], true);
    }
};
