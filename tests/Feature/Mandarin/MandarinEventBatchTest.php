<?php

namespace Tests\Feature\Mandarin;

use Tests\TestCase;

/**
 * The client replays its offline outbox in fixed-size batches. An oversized
 * upload is a 422, and for a replay that is permanent — the backlog can only
 * grow, so every event behind it would be stranded for good. The two limits
 * therefore have to stay in step, and a config change is the easy way to
 * separate them silently.
 */
class MandarinEventBatchTest extends TestCase
{
    public function test_the_server_batch_limit_is_not_lowered_below_what_the_client_sends(): void
    {
        $source = file_get_contents(resource_path('js/games/mandarin/domain/outbox.ts'));
        $this->assertIsString($source);
        $this->assertSame(1, preg_match('/MAX_EVENT_BATCH = (\d+)/', $source, $matches),
            'Could not read MAX_EVENT_BATCH from domain/outbox.ts.');

        $clientBatch = (int) $matches[1];
        $serverLimit = (int) config('mandarin.events.max_batch');

        $this->assertGreaterThanOrEqual($clientBatch, $serverLimit,
            "mandarin.events.max_batch ({$serverLimit}) is below the client's MAX_EVENT_BATCH ({$clientBatch}); "
            .'offline replays would be rejected permanently. Lower MAX_EVENT_BATCH in domain/outbox.ts to match.');
    }

    /**
     * The server reports schedulerVersion and the client replays the log with its own
     * parameters; if the two names drift, projections made under different step
     * policies look identical in diagnostics and evaluation data.
     */
    public function test_the_client_and_server_name_the_same_scheduler_version(): void
    {
        $source = file_get_contents(resource_path('js/games/mandarin/domain/scheduler.ts'));
        $this->assertIsString($source);
        $this->assertSame(1, preg_match("/SCHEDULER_VERSION = '([^']+)'/", $source, $matches),
            'Could not read SCHEDULER_VERSION from domain/scheduler.ts.');

        $this->assertSame($matches[1], config('mandarin.events.scheduler_version'),
            'mandarin.events.scheduler_version must match SCHEDULER_VERSION in domain/scheduler.ts.');
    }
}
