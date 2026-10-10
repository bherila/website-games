<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Expired delegated access nonces, and operation receipts past their 30 days.
Schedule::command('bherila-auth:prune-delegated-nonces')->daily();
