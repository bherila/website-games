<?php

namespace App\Services\Games\Mandarin\Audio;

use Illuminate\Contracts\Cache\Repository as Cache;

/**
 * Daily character budget reserved atomically before each provider attempt.
 * Counts every attempt (including retries), never cache hits or procedural
 * SFX. Backed by the shared cache store so all workers see the same counter.
 */
class GenerationBudget
{
    public function __construct(private readonly Cache $cache, private readonly int $dailyCharacters) {}

    /** Reserves `characters`; returns false (and reserves nothing) when the day's budget would be exceeded. */
    public function reserve(int $characters): bool
    {
        $key = $this->key();
        $this->cache->add($key, 0, now()->addDays(2));
        $used = (int) $this->cache->increment($key, $characters);
        if ($used > $this->dailyCharacters) {
            $this->cache->decrement($key, $characters);

            return false;
        }

        return true;
    }

    public function used(): int
    {
        return (int) $this->cache->get($this->key(), 0);
    }

    public function remaining(): int
    {
        return max(0, $this->dailyCharacters - $this->used());
    }

    private function key(): string
    {
        return 'mandarin:speech-budget:'.now()->toDateString();
    }
}
