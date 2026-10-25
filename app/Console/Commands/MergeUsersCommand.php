<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Account\AccountMerge;
use App\Services\Account\AccountMergeRefused;
use App\Services\Admin\AccessAudit;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Merge one account into another for support cases, with the same rules as the account page
 * ({@see AccountMerge}). Accounts are named by local users id only; confirm out of band that both
 * belong to the same person. The kept account keeps its email; the absorbed one is deleted.
 */
#[Signature('users:merge
    {keep : The local users id to keep}
    {absorb : The local users id to merge into it and delete}
    {--force : Skip the confirmation prompt}')]
#[Description('Merge one account into another and delete it.')]
class MergeUsersCommand extends Command
{
    public function handle(AccountMerge $merge): int
    {
        $keep = User::query()->find($this->argument('keep'));
        $absorb = User::query()->find($this->argument('absorb'));
        if ($keep === null || $absorb === null) {
            $this->error('Both arguments must be existing users ids.');

            return self::FAILURE;
        }

        try {
            $merge->assertMergeable($keep, $absorb);
        } catch (AccountMergeRefused $refusal) {
            $this->error($refusal->getMessage());

            return self::FAILURE;
        }

        $this->line("Keep users#{$keep->getKey()}; merge users#{$absorb->getKey()} into it ({$absorb->gameData()->count()} game rows, {$absorb->towerSaveSlots()->count()} tower slots), then delete it.");
        if (! $this->option('force') && ! $this->confirm('Merge these accounts?')) {
            $this->line('Nothing changed.');

            return self::SUCCESS;
        }

        $summary = $merge->merge($keep, $absorb, AccessAudit::METHOD_CONSOLE, null);
        $this->info("Merged users#{$absorb->getKey()} into users#{$keep->getKey()}: {$summary['game_rows']} game rows, {$summary['tower_slots']} tower slots, {$summary['practice_events']} practice events.");

        return self::SUCCESS;
    }
}
