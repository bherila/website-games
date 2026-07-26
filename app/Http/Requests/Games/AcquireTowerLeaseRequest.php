<?php

namespace App\Http\Requests\Games;

/**
 * Validates a lease acquire / take-over request. `force` bypasses an existing
 * unexpired lease (the "Take over" flow); `lease_token`, when present, lets a
 * client renew a lease it already holds without a conflict.
 */
class AcquireTowerLeaseRequest extends TowerSaveSlotRouteRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            ...parent::rules(),
            'force' => ['sometimes', 'boolean'],
            'lease_token' => ['nullable', 'string', 'max:64'],
        ];
    }

    public function forceTakeover(): bool
    {
        return $this->boolean('force');
    }

    public function leaseToken(): ?string
    {
        $token = $this->validated('lease_token');

        return $token === null ? null : (string) $token;
    }
}
