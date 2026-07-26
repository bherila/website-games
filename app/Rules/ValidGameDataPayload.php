<?php

namespace App\Rules;

use App\Enums\Games\GameDataScope;
use Closure;
use Illuminate\Contracts\Validation\DataAwareRule;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Str;
use Illuminate\Translation\PotentiallyTranslatedString;
use JsonException;

class ValidGameDataPayload implements DataAwareRule, ValidationRule
{
    public const MAX_ENCODED_BYTES = self::SAVE_MAX_ENCODED_BYTES;

    public const PROGRESS_MAX_ENCODED_BYTES = 8_192;

    public const SAVE_MAX_ENCODED_BYTES = 262_144;

    private const MAX_SAFE_INTEGER = 9_007_199_254_740_991;

    /** @var list<string> */
    private const NON_NEGATIVE_INTEGER_METRICS = [
        'score',
        'clears',
        'maps_cleared',
        'best_score',
        'best_round_index',
        'total_score',
        'high_score',
        'survivors',
        'highest_tile',
        'games_played',
    ];

    /** @var array<string, mixed> */
    private array $data = [];

    public function __construct(private readonly ?GameDataScope $scope = null) {}

    /**
     * Run the validation rule.
     *
     * @param  Closure(string, ?string=): PotentiallyTranslatedString  $fail
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_array($value)) {
            return;
        }

        if ($value !== [] && array_is_list($value)) {
            $fail('The :attribute must be a JSON object.');

            return;
        }

        $invalidMetric = $this->invalidMetric($value);
        if ($invalidMetric !== null) {
            $fail("The {$invalidMetric} metric in :attribute has an invalid value.");

            return;
        }

        try {
            $encoded = json_encode($value, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            $fail('The :attribute must contain valid JSON data.');

            return;
        }

        $scope = $this->scope ?? $this->scopeFromNestedAttribute($attribute);
        $maximumBytes = $scope === GameDataScope::Save
            ? self::SAVE_MAX_ENCODED_BYTES
            : self::PROGRESS_MAX_ENCODED_BYTES;
        if (strlen($encoded) > $maximumBytes) {
            $maximumKibibytes = intdiv($maximumBytes, 1_024);
            $fail("The :attribute may not exceed {$maximumKibibytes} KiB when encoded as JSON.");
        }
    }

    /**
     * Set all data under validation so nested batch payloads can use the
     * byte limit for their associated scope.
     *
     * @param  array<string, mixed>  $data
     */
    public function setData(array $data): static
    {
        $this->data = $data;

        return $this;
    }

    /** @param array<mixed> $value */
    private function invalidMetric(array $value): ?string
    {
        foreach ($value as $key => $entry) {
            $normalizedKey = is_string($key) ? Str::snake($key) : null;
            if ($normalizedKey === 'stars' && ! $this->isIntegerBetween($entry, 0, 3)) {
                return $normalizedKey;
            }
            if (
                $normalizedKey !== null
                && in_array($normalizedKey, self::NON_NEGATIVE_INTEGER_METRICS, true)
                && ! $this->isIntegerBetween($entry, 0, self::MAX_SAFE_INTEGER)
            ) {
                return $normalizedKey;
            }
            if (
                in_array($normalizedKey, ['unlocked_level', 'best_moves'], true)
                && ! $this->isIntegerBetween($entry, 1, self::MAX_SAFE_INTEGER)
            ) {
                return $normalizedKey;
            }

            if (is_array($entry)) {
                $invalidMetric = $this->invalidMetric($entry);
                if ($invalidMetric !== null) {
                    return $invalidMetric;
                }
            }
        }

        return null;
    }

    private function isIntegerBetween(mixed $value, int $minimum, int $maximum): bool
    {
        return is_int($value) && $value >= $minimum && $value <= $maximum;
    }

    private function scopeFromNestedAttribute(string $attribute): ?GameDataScope
    {
        if (! preg_match('/^operations\.(\d+)\.data$/', $attribute, $matches)) {
            return null;
        }

        $index = (int) $matches[1];
        $operations = $this->data['operations'] ?? null;
        $operation = is_array($operations) ? ($operations[$index] ?? null) : null;
        $scope = is_array($operation) ? ($operation['scope'] ?? null) : null;

        return is_string($scope) ? GameDataScope::tryFrom($scope) : null;
    }
}
