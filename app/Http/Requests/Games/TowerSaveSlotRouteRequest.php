<?php

namespace App\Http\Requests\Games;

use App\Models\TowerSaveSlot;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Shared base for Tower Throwback save-slot endpoints: authorises the request
 * and validates the `{slot}` route segment against the bounded slot-key set.
 */
class TowerSaveSlotRouteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'slot' => ['required', 'string', Rule::in(TowerSaveSlot::SLOT_KEYS)],
        ];
    }

    /**
     * Fold the route parameter into the validated data so the slot key is
     * validated with the same rules as body fields.
     */
    protected function prepareForValidation(): void
    {
        $this->merge(['slot' => (string) $this->route('slot')]);
    }

    public function slotKey(): string
    {
        return (string) $this->validated('slot');
    }
}
