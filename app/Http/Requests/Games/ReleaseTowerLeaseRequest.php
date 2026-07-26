<?php

namespace App\Http\Requests\Games;

/**
 * Validates a lease release. The release is idempotent: presenting a token that
 * no longer matches the current lease is a no-op rather than an error.
 */
class ReleaseTowerLeaseRequest extends TowerSaveSlotRouteRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            ...parent::rules(),
            'lease_token' => ['required', 'string', 'max:64'],
        ];
    }

    public function leaseToken(): string
    {
        return (string) $this->validated('lease_token');
    }
}
