<?php

namespace App\Http\Requests\Games;

use App\Models\TowerSaveSlot;
use Closure;
use Illuminate\Validation\Rule;

/**
 * Validates a lease-checked write to a Tower Throwback save slot. The payload
 * itself is opaque; only its size, wire version, and the accompanying display
 * metadata + lease token are validated here.
 */
class StoreTowerSaveRequest extends TowerSaveSlotRouteRequest
{
    /**
     * Hard cap on the serialised payload, in BYTES.
     *
     * The client's LOCAL budget is deliberately larger (5,000,000 JSON chars)
     * so a big tower can still be saved in the browser; this is the separate,
     * smaller cloud budget. The client mirrors this exact value in
     * `resources/js/games/tower-throwback/saveBudget.ts` as
     * `MAX_CLOUD_PAYLOAD_BYTES` and refuses to push an over-budget save rather
     * than letting it fail here. Keep the two in sync.
     */
    public const MAX_PAYLOAD_BYTES = 1_048_576;

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            ...parent::rules(),
            'payload' => ['required', 'array', $this->payloadSizeRule()],
            'wire_version' => ['required', 'integer', Rule::in(TowerSaveSlot::SUPPORTED_WIRE_VERSIONS)],
            'lease_token' => ['required', 'string', 'max:64'],
            'game_day' => ['nullable', 'integer', 'min:0'],
            'star' => ['nullable', 'integer', 'min:1', 'max:5'],
            'population' => ['nullable', 'integer', 'min:0'],
            'funds' => ['nullable', 'integer'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'wire_version.in' => 'This save version is not supported by the server.',
        ];
    }

    /**
     * Rejects payloads that exceed the byte budget once serialised. Measured on
     * the re-encoded array so a client cannot smuggle an oversized blob past the
     * cap with unusual whitespace.
     */
    private function payloadSizeRule(): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail): void {
            // Match JSON.stringify's wire representation: literal UTF-8 and
            // unescaped slashes. Default json_encode() expands them (for example
            // `é` to `\u00e9`), which made the client's byte-accurate preflight
            // undercount the exact payload this rule measured.
            $encoded = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($encoded === false || strlen($encoded) > self::MAX_PAYLOAD_BYTES) {
                $fail('The save payload is too large.');
            }
        };
    }

    /** @return array<string, mixed> */
    public function payload(): array
    {
        /** @var array<string, mixed> $payload */
        $payload = $this->validated('payload');

        return $payload;
    }

    public function wireVersion(): int
    {
        return (int) $this->validated('wire_version');
    }

    public function leaseToken(): string
    {
        return (string) $this->validated('lease_token');
    }

    /**
     * @return array{game_day: int|null, star: int|null, population: int|null, funds: int|null}
     */
    public function displayMetadata(): array
    {
        return [
            'game_day' => $this->integerOrNull('game_day'),
            'star' => $this->integerOrNull('star'),
            'population' => $this->integerOrNull('population'),
            'funds' => $this->integerOrNull('funds'),
        ];
    }

    private function integerOrNull(string $key): ?int
    {
        $value = $this->validated($key);

        return $value === null ? null : (int) $value;
    }
}
