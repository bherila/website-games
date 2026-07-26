<?php

namespace App\Services\Games;

use Illuminate\Support\Str;

class GameDataMerger
{
    /** @var list<string> */
    private const MAXIMUM_METRICS = [
        'score',
        'stars',
        'clears',
        'maps_cleared',
        'unlocked_level',
        'best_score',
        'best_round_index',
        'total_score',
        'high_score',
        'survivors',
        'highest_tile',
        // Monotonic rather than additive on purpose: two devices that each
        // report 5 games settle on 5. Summing would double-count a replayed
        // batch, and this row must never move backwards.
        'games_played',
    ];

    /** @var list<string> */
    private const MINIMUM_POSITIVE_METRICS = [
        'best_moves',
    ];

    /**
     * Merge a profile or level update without allowing a stale client to
     * overwrite progress metrics with a worse value.
     *
     * @param  array<mixed>  $existing
     * @param  array<mixed>  $incoming
     * @return array<mixed>
     */
    public function merge(array $existing, array $incoming): array
    {
        if ($incoming === []) {
            return $existing;
        }

        return $this->mergeArrays($existing, $incoming);
    }

    /**
     * @param  array<mixed>  $existing
     * @param  array<mixed>  $incoming
     * @return array<mixed>
     */
    private function mergeArrays(array $existing, array $incoming): array
    {
        if (array_is_list($existing) || array_is_list($incoming)) {
            return $incoming;
        }

        foreach ($incoming as $key => $incomingValue) {
            $existingValue = $existing[$key] ?? null;
            $normalizedKey = Str::snake((string) $key);

            if (is_array($existingValue) && is_array($incomingValue)) {
                $existing[$key] = $this->mergeArrays($existingValue, $incomingValue);

                continue;
            }

            if (in_array($normalizedKey, self::MAXIMUM_METRICS, true)) {
                $existing[$key] = $this->maximum($existingValue, $incomingValue);

                continue;
            }

            if (in_array($normalizedKey, self::MINIMUM_POSITIVE_METRICS, true)) {
                $existing[$key] = $this->minimumPositive($existingValue, $incomingValue);

                continue;
            }

            $existing[$key] = $incomingValue;
        }

        return $existing;
    }

    private function maximum(mixed $existing, mixed $incoming): mixed
    {
        if ($this->isNumber($existing)) {
            return $this->isNumber($incoming) ? max($existing, $incoming) : $existing;
        }

        return $incoming;
    }

    private function minimumPositive(mixed $existing, mixed $incoming): mixed
    {
        $existingIsPositive = $this->isNumber($existing) && $existing > 0;
        $incomingIsPositive = $this->isNumber($incoming) && $incoming > 0;

        if ($existingIsPositive && $incomingIsPositive) {
            return min($existing, $incoming);
        }

        if ($existingIsPositive) {
            return $existing;
        }

        return $incoming;
    }

    private function isNumber(mixed $value): bool
    {
        return is_int($value) || is_float($value);
    }
}
